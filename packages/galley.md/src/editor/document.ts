import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMdx, { type Options as MdxOptions } from "remark-mdx"
import remarkParse from "remark-parse"
import { unified } from "unified"

import { recoverDocument } from "./recovery.ts"
import { typescriptParser } from "./typescript.ts"

export const mdxParserOptions: MdxOptions = {
	acorn: typescriptParser,
	acornOptions: { ecmaVersion: 2025 as const },
}

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
	importKind?: "type" | "value"
	source: Span & { value: string }
	specifiers: (Span & {
		type: string
		local: Span & { name: string }
	})[]
	attributes?: Attribute[]
}

export function parseEditorDocument(source: string): Root {
	return recoverDocument(source).tree
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
