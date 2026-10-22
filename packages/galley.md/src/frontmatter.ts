import type { Root, RootContent } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { isMap, parseDocument } from "yaml"

const parser = unified().use(remarkParse).use(remarkFrontmatter)

/** Read build metadata without evaluating imports or components. */
export function frontmatterOutput(
	source: string,
	file: string,
): string | undefined {
	const node = parser.parse(source).children[0]
	return node?.type === "yaml" ? metadata(node.value, file).output : undefined
}

function metadata(
	value: string,
	file: string,
): { output?: string; value?: string } {
	// The Markdown parser excludes the newline before the closing fence.
	// YAML block scalars can give that newline semantic meaning.
	const document = parseDocument(`${value}\n`)
	const fail = (message: string): never => {
		throw new Error(`${file}: ${message}`)
	}
	if (document.errors.length)
		fail(`Invalid YAML frontmatter: ${document.errors[0]!.message}`)
	if (document.contents === null) return { value }
	if (!isMap(document.contents)) fail("Frontmatter must be a YAML mapping.")
	if (!document.has("galley")) return { value }
	const galley = document.get("galley")
	if (!isMap(galley)) return fail("Frontmatter galley must be a mapping.")
	const output = galley.get("output")
	if (
		galley.has("output") &&
		(typeof output !== "string" || !output.trim() || /[\0\r\n]/.test(output))
	)
		fail("Frontmatter galley.output must be a nonempty path string.")
	document.delete("galley")
	return {
		...(typeof output === "string" ? { output } : {}),
		...(isMap(document.contents) && document.contents.items.length
			? { value: document.toString().replace(/\n$/, "") }
			: {}),
	}
}

/** Consume Galley settings while retaining document frontmatter as Markdown. */
export function consumeFrontmatter() {
	return (tree: Root, file: { path: string }) => {
		tree.children = tree.children.flatMap((node): RootContent[] => {
			if (node.type !== "yaml") return [node]
			const { value } = metadata(node.value, file.path)
			return value === undefined ? [] : [{ ...node, value }]
		})
	}
}
