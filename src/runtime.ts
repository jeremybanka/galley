import path from "node:path"

import type { Nodes, Root, RootContent } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"

import type {
	ComponentPreview,
	Content,
	DocumentContext,
	Element,
} from "./types.ts"

const previewSink = Symbol("galley:previews")
type RenderContext = DocumentContext & { [previewSink]?: ComponentPreview[] }

const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkStringify, { bullet: "-", fences: true, listItemIndent: "one" })

/** Include Markdown produced by another tool as Markdown nodes. */
export function Markdown({ children }: { children: string }): Root {
	return markdownProcessor.parse(children)
}

/** A code component returns source text; the serializer owns safe fencing. */
export function Code({
	source,
	lang,
}: {
	source: string
	lang?: string
}): Nodes {
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
	return markdownProcessor.stringify(root)
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
		if (element.type === "galley-preview") {
			const children = await resolveContent(
				element.props.children as Content,
				context,
			)
			context[previewSink]?.push({
				file: String(element.props.file),
				start: Number(element.props.start),
				end: Number(element.props.end),
				markdown: markdownProcessor.stringify({
					type: "root",
					children: blocks(children),
				}),
			})
			return children
		}
		if (
			element.type === "galley-fragment" ||
			element.type === "galley-expression"
		)
			return resolveContent(element.props.children as Content, context)
		if (element.type === "galley-flow")
			return blocks(
				await resolveContent(element.props.children as Content, context),
			)
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
	const children = await resolveContent(
		element.props.children as Content,
		context,
	)
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
		`Unsupported Markdown element <${String(element.type)}>. Use Markdown syntax or return a Markdown node from a component.`,
	)
}
