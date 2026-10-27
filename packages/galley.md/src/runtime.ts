import path from "node:path"

import { toHtml } from "hast-util-to-html"
import { phrasing as htmlPhrasing } from "hast-util-phrasing"
import type { Nodes, Root, RootContent } from "mdast"
import { toHast } from "mdast-util-to-hast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"

import type { PreviewFailure } from "./editor/recovery.ts"
import { formatMarkdown } from "./format.ts"
import {
	cellContent,
	inlineHtml,
	renderTableElement,
	tablePreview,
} from "./tables.ts"
import type {
	ComponentPreview,
	Content,
	DocumentContext,
	Element,
} from "./types.ts"

const previewSink = Symbol("galley:previews")
const previewErrors = Symbol("galley:preview-errors")
const htmlMode = Symbol("galley:html")
type RenderContext = DocumentContext & {
	[previewSink]?: ComponentPreview[]
	[previewErrors]?: PreviewFailure[]
	[htmlMode]?: boolean
	tableParent?: string | undefined
	svg?: boolean
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
export const Markdown = Object.assign(
	function Markdown(props: { children: string }): Root {
		assertProps("Markdown", props, ["children"])
		return markdownProcessor.parse(props.children)
	},
	{ Table: MarkdownTable },
)

/** Convert explicit rows and cells into a GFM pipe table. */
function MarkdownTable(props: { children?: Content }): Element {
	assertProps("Markdown.Table", props, ["children"])
	return { kind: "galley:element", type: "galley-table", props }
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

/** @deprecated Use native JSX tags and attributes instead. */
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
	errors?: PreviewFailure[],
): Promise<string> {
	const nodes = await resolveContent(content, {
		...context,
		...(previews ? { [previewSink]: previews } : {}),
		...(errors ? { [previewErrors]: errors } : {}),
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
		if (element.type === "galley-table") {
			if (context.tableParent)
				throw new Error(
					"Nested tables cannot be represented in a Markdown table.",
				)
			return (await renderTableElement(
				{ ...element, type: "table" },
				undefined,
				(children, tableParent) =>
					resolveContent(children, {
						...context,
						[htmlMode]: false,
						tableParent,
					}),
			))!
		}
		if (element.type === "galley-html") {
			const children = await resolveContent(element.props.children as Content, {
				...context,
				[htmlMode]: true,
			})
			return [{ type: "html", value: htmlContent(children) }]
		}
		if (element.type === "galley-preview") {
			try {
				const children = await resolveContent(
					(context[previewErrors] &&
					typeof element.props.children === "function"
						? element.props.children()
						: element.props.children) as Content,
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
			} catch (error) {
				if (!context[previewErrors]) throw error
				context[previewErrors].push({
					file: String(element.props.file),
					start: Number(element.props.start),
					end: Number(element.props.end),
					message: error instanceof Error ? error.message : String(error),
				})
				return []
			}
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
		if (phrasing.has(node.type) || inlineHtml.has(node)) pending.push(node)
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
	if (context.tableParent) {
		const table = await renderTableElement(
			element,
			context.tableParent,
			(children, tableParent) =>
				resolveContent(children, { ...context, tableParent }),
		)
		if (table) return table
	}
	const tagName = String(element.type)
	if (!/^[a-zA-Z][a-zA-Z0-9:.-]*$/.test(tagName))
		throw new Error(`Invalid HTML tag: ${tagName}`)
	const svg = tagName === "svg" || (context.svg && tagName !== "foreignObject")
	const children = await resolveContent(element.props.children as Content, {
		...context,
		[htmlMode]: true,
		svg: Boolean(svg),
	})
	const properties: Record<string, HtmlAttribute> = {}
	for (const [name, value] of Object.entries(element.props)) {
		if (name === "children" || name === "key") continue
		if (
			/^on/i.test(name) ||
			name === "ref" ||
			name === "dangerouslySetInnerHTML"
		)
			throw new Error(
				`HTML property ${name} is not supported in static output.`,
			)
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
	const phrasingElement = htmlPhrasing({
		type: "element",
		tagName,
		properties,
		children: [],
	})
	if (context.tableParent) {
		if (!phrasingElement || tagName === "br")
			throw new Error(
				`Markdown.Table cells support inline content only; found <${tagName}>.`,
			)
		cellContent(children)
	}
	const node: RootContent = {
		type: "html",
		value: toHtml(
			{
				type: "element",
				tagName,
				properties,
				children: [{ type: "raw", value: htmlContent(children) }],
			},
			{ allowDangerousHtml: true, space: svg ? "svg" : "html" },
		),
	}
	if (phrasingElement) inlineHtml.add(node)
	return [node]
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
