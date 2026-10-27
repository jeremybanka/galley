import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { parseDocument } from "./document.ts"

export type PreviewFailure = {
	file: string
	start: number
	end: number
	message: string
}
export type SyntaxFailure = Omit<PreviewFailure, "file">

const markdown = unified().use(remarkParse).use(remarkFrontmatter)

/** Editor-only recovery. Preserve UTF-16 positions and never promote fenced examples to code. */
export function recoverDocument(source: string): {
	tree: Root
	source: string
	errors: SyntaxFailure[]
} {
	try {
		return { tree: parseDocument(source), source, errors: [] }
	} catch {
		/* Recover complete regions below. */
	}
	const protectedRanges: [number, number][] = []
	type Node = {
		type: string
		position?: { start: { offset?: number }; end: { offset?: number } }
		children?: Node[]
	}
	function protect(node: Node) {
		if ((node.type === "code" || node.type === "yaml") && node.position)
			protectedRanges.push([
				node.position.start.offset ?? 0,
				node.position.end.offset ?? source.length,
			])
		for (const child of node.children ?? []) protect(child)
	}
	protect(markdown.parse(source) as Node)
	const boundaries = [0]
	for (const match of source.matchAll(/\r?\n[\t ]*\r?\n/g)) {
		const end = match.index + match[0].length
		if (!protectedRanges.some(([start, stop]) => end > start && end < stop))
			boundaries.push(end)
	}
	if (boundaries.at(-1) !== source.length) boundaries.push(source.length)
	const characters = source.split("")
	const errors: SyntaxFailure[] = []
	let attempts = 0
	for (let index = 0; index < boundaries.length - 1;) {
		const start = boundaries[index]!
		let accepted = -1
		let failure: unknown
		for (
			let next = index + 1;
			next < boundaries.length && attempts < 256;
			next++
		) {
			attempts++
			try {
				parseDocument(source.slice(start, boundaries[next]))
				accepted = next
				break
			} catch (error) {
				failure ??= error
			}
		}
		if (accepted !== -1) {
			index = accepted
			continue
		}
		const end = attempts >= 256 ? source.length : boundaries[index + 1]!
		const error = failure as
			| {
					message?: string
					place?: { offset?: number; start?: { offset?: number } }
			  }
			| undefined
		const offset = Math.min(
			end - 1,
			start + (error?.place?.offset ?? error?.place?.start?.offset ?? 0),
		)
		errors.push({
			start: Math.max(start, offset),
			end: Math.max(start + 1, offset + 1),
			message:
				error?.message ??
				"Editor recovery limit reached; fix the preceding syntax error.",
		})
		for (let i = start; i < end; i++)
			if (characters[i] !== "\n" && characters[i] !== "\r") characters[i] = " "
		if (attempts >= 256) break
		index++
	}
	const recovered = characters.join("")
	return { tree: parseDocument(recovered), source: recovered, errors }
}
