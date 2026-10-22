import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import { unified } from "unified"

export const mdxParserOptions = { acornOptions: { ecmaVersion: 2025 as const } }

const parser = unified()
	.use(remarkParse)
	.use(remarkFrontmatter)
	.use(remarkMdx, mdxParserOptions)
	.use(remarkGfm)

export function parseDocument(source: string): Root {
	return parser.parse(source)
}

type Span = { start: number; end: number }
export type Attribute = Span & {
	key: Span & { name?: string; value?: string }
	value: Span & { value: string }
}
export type DocumentImport = Span & {
	type: "ImportDeclaration"
	source: Span & { value: string }
	specifiers: (Span & {
		type: string
		local: Span & { name: string }
	})[]
	attributes?: Attribute[]
}

export function parseEditorDocument(source: string): Root {
	let tree: Root
	try {
		tree = parseDocument(source)
	} catch (error) {
		// A half-written JSX element must not invalidate earlier complete imports.
		let end = source.length
		let recovered: Root | undefined
		for (let attempt = 0; attempt < 32 && end > 0; attempt++) {
			end = source.lastIndexOf("\n", end - 1)
			try {
				recovered = parseDocument(source.slice(0, Math.max(0, end)))
				break
			} catch {
				/* Try the preceding complete line. */
			}
		}
		if (!recovered) throw error
		tree = recovered
	}
	return tree
}

export function documentImports(source: string): DocumentImport[] {
	const tree = parseEditorDocument(source)
	return tree.children.flatMap((node) => {
		if (node.type !== "mdxjsEsm") return []
		const program = node.data?.estree as unknown as {
			body: { type: string }[]
		}
		return program.body.filter(
			(statement): statement is DocumentImport =>
				statement.type === "ImportDeclaration",
		)
	})
}

/**
 * mdx-content-mapper 0.0.2 assumes every link label belongs to an image and
 * throws on ordinary Markdown links. Keep their children (including JSX and
 * expressions) and erase only the link framing, without changing any offsets.
 * Erase frontmatter too so the upstream mapper never treats YAML as MDX.
 */
export function projectMarkdownLinks(source: string): string {
	let tree: Root
	try {
		tree = parseEditorDocument(source)
	} catch {
		return source
	}
	const characters = source.split("")
	type Node = {
		type: string
		children?: Node[]
		position?: { start: { offset?: number }; end: { offset?: number } }
	}
	function erase(start: number | undefined, end: number | undefined) {
		if (start === undefined || end === undefined) return
		for (let i = start; i < end; i++)
			if (characters[i] !== "\n" && characters[i] !== "\r") characters[i] = " "
	}
	function visit(node: Node) {
		if (node.type === "link" || node.type === "linkReference") {
			const first = node.children?.[0]?.position
			const last = node.children?.at(-1)?.position
			erase(
				node.position?.start.offset,
				first?.start.offset ?? node.position?.end.offset,
			)
			erase(
				last?.end.offset ?? node.position?.start.offset,
				node.position?.end.offset,
			)
		} else if (
			node.type === "imageReference" ||
			node.type === "definition" ||
			node.type === "yaml"
		) {
			erase(node.position?.start.offset, node.position?.end.offset)
		}
		for (const child of node.children ?? []) visit(child)
	}
	visit(tree as Node)
	return characters.join("")
}

export function importAttributes(
	statement: DocumentImport,
): Record<string, string> {
	return Object.fromEntries(
		(statement.attributes ?? []).map(({ key, value }) => [
			key.name ?? key.value,
			value.value,
		]),
	)
}
