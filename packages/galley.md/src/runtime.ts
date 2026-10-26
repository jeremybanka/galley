import path from "node:path"

import { toHtml } from "hast-util-to-html"
import type { Nodes, Root, RootContent } from "mdast"
import { toHast } from "mdast-util-to-hast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"

import { formatMarkdown } from "./format.ts"
import { renderTableElement, tablePreview } from "./tables.ts"
import type {
	ComponentPreview,
	Content,
	DocumentContext,
	Element,
} from "./types.ts"

const previewSink = Symbol("galley:previews")
const htmlMode = Symbol("galley:html")
type RenderContext = DocumentContext & {
	[previewSink]?: ComponentPreview[]
	[htmlMode]?: boolean
	tableParent?: string | undefined
}

const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkFrontmatter)
	.use(remarkGfm)
	.use(remarkStringify, { bullet: "-", fences: true, listItemIndent: "one" })

function stringifyMarkdown(root: Root): string {
	const [first, ...rest] = root.children
	if (first?.type !== "yaml")
		return formatMarkdown(markdownProcessor.stringify(root))
	// Blank lines in YAML block scalars are data, not Markdown whitespace.
	const header = markdownProcessor.stringify({
		type: "root",
		children: [first],
	})
	const body = formatMarkdown(
		markdownProcessor.stringify({ type: "root", children: rest }),
	)
	return body ? `${header}\n${body}` : header
}

function assertProps(name: string, props: object, allowed: readonly string[]) {
	for (const key of Object.keys(props)) {
		if (key !== "key" && !allowed.includes(key))
			throw new Error(`Unsupported property "${key}" on ${name}.`)
	}
}

/** Include Markdown produced by another tool as Markdown nodes. */
export function Markdown(props: { children: string }): Root {
	assertProps("Markdown", props, ["children"])
	const { children } = props
	return markdownProcessor.parse(children)
}

/** Preserve children as an HTML comment in the generated Markdown. */
export async function Comment(
	props: { children: Content },
	context: DocumentContext,
): Promise<Nodes> {
	assertProps("Comment", props, ["children"])
	const { children } = props
	const commentContext: RenderContext = { ...context, [htmlMode]: false }
	const value = (await renderMarkdown(children, commentContext)).trim()
	if (/<!--|-->|--!>/.test(value)) {
		throw new Error("Comment children cannot contain HTML comment delimiters.")
	}
	return { type: "html", value: `<!-- ${value} -->` }
}

/** Render children as HTML without adding a wrapper element. */
export const Html = Object.assign(
	function Html(props: { children?: Content }): Element {
		assertProps("Html", props, ["children"])
		return { kind: "galley:element", type: "galley-html", props }
	},
	{ Element: HtmlElement },
)

type HtmlAttribute =
	| string
	| number
	| boolean
	| null
	| undefined
	| (string | number)[]

/** Explicit HTML/custom-element attributes, isolated from Markdown JSX props. */
function HtmlElement(props: {
	tag: string
	attributes?: Record<string, HtmlAttribute>
	children?: Content
}): Element {
	assertProps("Html.Element", props, ["tag", "attributes", "children"])
	if (!/^[a-z][a-z0-9-]*$/.test(props.tag))
		throw new Error(
			"Html.Element requires a lowercase HTML or custom-element tag.",
		)
	if (props.attributes && "children" in props.attributes)
		throw new Error("Pass Html.Element children as children, not an attribute.")
	return {
		kind: "galley:element",
		type: "galley-html",
		props: {
			children: {
				kind: "galley:element",
				type: props.tag,
				props: { ...props.attributes, children: props.children },
			},
		},
	}
}

/** A code component returns source text; the serializer owns safe fencing. */
export function Code(props: { source: string; lang?: string }): Nodes {
	assertProps("Code", props, ["source", "lang"])
	const { source, lang } = props
	if (lang !== undefined && /[\r\n`]/.test(lang)) {
		throw new Error("Code languages cannot contain newlines or backticks.")
	}
	return {
		type: "code",
		value: source,
		...(lang === undefined ? {} : { lang }),
	}
}

export async function renderMarkdown(
	content: Content,
	context: DocumentContext,
	previews?: ComponentPreview[],
): Promise<string> {
	const nodes = await resolveContent(content, {
		...context,
		...(previews ? { [previewSink]: previews } : {}),
	})
	const root: Root = { type: "root", children: blocks(nodes) }
	return stringifyMarkdown(root)
}

async function resolveContent(
	content: Content,
	context: RenderContext,
): Promise<RootContent[]> {
	const value = await content
	if (value === null || value === undefined || typeof value === "boolean")
		return []
	if (typeof value === "string" || typeof value === "number") {
		return [{ type: "text", value: String(value) }]
	}
	if (Array.isArray(value)) {
		const result: RootContent[] = []
		for (const child of value)
			result.push(...(await resolveContent(child, context)))
		return result
	}
	if ("kind" in value && value.kind === "galley:element") {
		const element = value as Element
		if (typeof element.type === "function") {
			return resolveContent(
				element.type(element.props as never, context),
				context,
			)
		}
		if (element.type === "galley-html") {
			const children = await resolveContent(element.props.children as Content, {
				...context,
				[htmlMode]: true,
			})
			return [{ type: "html", value: htmlContent(children) }]
		}
		if (element.type === "galley-preview") {
			const children = await resolveContent(
				element.props.children as Content,
				context,
			)
			context[previewSink]?.push({
				file: String(element.props.file),
				start: Number(element.props.start),
				end: Number(element.props.end),
				markdown: context[htmlMode]
					? htmlContent(children)
					: stringifyMarkdown({
							type: "root",
							children: blocks(tablePreview(children, context.tableParent)),
						}),
			})
			return children
		}
		if (
			element.type === "galley-fragment" ||
			element.type === "galley-expression"
		)
			return resolveContent(element.props.children as Content, context)
		if (element.type === "galley-flow") {
			const children = await resolveContent(
				element.props.children as Content,
				context,
			)
			return context[htmlMode] ? children : blocks(children)
		}
		if (element.type === "galley-node") {
			const node = JSON.parse(String(element.props.node)) as Nodes
			const document =
				typeof element.props.file === "string"
					? {
							...context,
							path: element.props.file,
							directory: path.dirname(element.props.file),
						}
					: context
			if ("children" in node) {
				const content = element.props.children as Content
				// MDX inserts layout newlines between JSX blocks. Authored text is
				// wrapped in node elements, so only these raw strings are dropped.
				const children = await resolveContent(
					Array.isArray(content)
						? content.filter((child) => child !== "\n")
						: content,
					document,
				)
				node.children = children as never
			}
			return node.type === "root"
				? blocks(node.children)
				: [node as RootContent]
		}
		return intrinsic(element, context)
	}
	if ("type" in value && typeof value.type === "string") {
		const node = value as Nodes
		return node.type === "root" ? node.children : [node as RootContent]
	}
	throw new Error(
		"A Markdown component must return Markdown nodes, text, or elements.",
	)
}

const phrasing = new Set([
	"text",
	"emphasis",
	"strong",
	"delete",
	"inlineCode",
	"break",
	"link",
	"linkReference",
	"image",
	"imageReference",
	"footnoteReference",
])

function blocks(nodes: RootContent[]): RootContent[] {
	const output: RootContent[] = []
	let pending: RootContent[] = []
	function flush() {
		if (pending.length)
			output.push({ type: "paragraph", children: pending as never })
		pending = []
	}
	for (const node of nodes) {
		if (phrasing.has(node.type)) pending.push(node)
		else {
			flush()
			output.push(node)
		}
	}
	flush()
	return output
}

async function intrinsic(
	element: Element,
	context: RenderContext,
): Promise<RootContent[]> {
	if (!context[htmlMode]) {
		const table = await renderTableElement(
			element,
			context.tableParent,
			(children, tableParent) =>
				resolveContent(children, { ...context, tableParent }),
		)
		if (table) return table
		assertProps(
			`<${String(element.type)}>`,
			element.props,
			element.type === "a" ? ["children", "href"] : ["children"],
		)
	}
	const children = await resolveContent(
		element.props.children as Content,
		context,
	)
	if (context[htmlMode]) {
		const properties: Record<
			string,
			string | number | boolean | null | undefined | (string | number)[]
		> = {}
		for (const [name, value] of Object.entries(element.props)) {
			if (name === "children" || name === "key") continue
			if (
				value === null ||
				value === undefined ||
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean" ||
				(Array.isArray(value) &&
					value.every(
						(item: unknown) =>
							typeof item === "string" || typeof item === "number",
					))
			)
				properties[name] =
					typeof value === "boolean" && /^(aria|data)(-|[A-Z])/.test(name)
						? String(value)
						: value
			else
				throw new Error(
					`HTML attribute ${name} must be a string, number, boolean, or array of strings or numbers.`,
				)
		}
		return [
			{
				type: "html",
				value: toHtml(
					{
						type: "element",
						tagName: String(element.type),
						properties,
						children: [{ type: "raw", value: htmlContent(children) }],
					},
					{ allowDangerousHtml: true },
				),
			},
		]
	}
	const tags: Record<string, string> = {
		p: "paragraph",
		strong: "strong",
		em: "emphasis",
		del: "delete",
		blockquote: "blockquote",
	}
	const type = tags[String(element.type)]
	if (type)
		return [
			{
				type,
				children: type === "blockquote" ? blocks(children) : children,
			} as RootContent,
		]
	if (/^h[1-6]$/.test(String(element.type)))
		return [
			{
				type: "heading",
				depth: Number(String(element.type)[1]),
				children,
			} as RootContent,
		]
	if (element.type === "a")
		return [
			{
				type: "link",
				url: typeof element.props.href === "string" ? element.props.href : "",
				children,
			} as RootContent,
		]
	if (element.type === "br") return [{ type: "break" }]
	if (element.type === "hr") return [{ type: "thematicBreak" }]
	throw new Error(
		`Unsupported Markdown element <${String(element.type)}>. Wrap markup in <Html>, use Markdown syntax, or return a Markdown node from a component.`,
	)
}

function htmlContent(children: RootContent[]): string {
	return toHtml(
		toHast(
			{ type: "root", children },
			{
				allowDangerousHtml: true,
				// Preserve inline spacing instead of inserting root-level separators.
				handlers: {
					root: (state, node) => state.all(node),
				},
			},
		),
		{ allowDangerousHtml: true },
	)
}
