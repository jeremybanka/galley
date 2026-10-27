import { recoverDocument } from "../editor/recovery.ts"
import type { MappedOutput, SpanMapping } from "./protocol.ts"

type Node = {
	type: string
	value?: string
	name?: string | null
	children?: Node[]
	attributes?: Node[]
	position?: { start: { offset?: number }; end: { offset?: number } }
	data?: {
		estree?: {
			body: {
				type: string
				declaration?: { start: number; end: number; id?: { name: string } }
				source?: { start: number; end: number }
				specifiers?: {
					start: number
					end: number
					local: { start: number; end: number }
					exported: { name?: string; value?: string }
				}[]
				start: number
				end: number
			}[]
		}
	}
}

/** Project only executable MDX islands. All mappings are UTF-16 source slices. */
export function projectTypescript(source: string): MappedOutput {
	const recovered = recoverDocument(source)
	const tree = recovered.tree as Node
	const diagnostics: NonNullable<MappedOutput["diagnostics"]> =
		recovered.errors.map(({ start, end, message }) => ({
			start,
			length: end - start,
			code: 95002,
			messageText: message,
		}))
	let text = "/** @jsxImportSource galley.md */\n"
	const mappings: SpanMapping[] = []
	function copy(start: number, end: number) {
		if (end <= start) return
		mappings.push([text.length, end - start, start, end - start, 0, 1_048_575])
		text += source.slice(start, end)
	}
	let hasProps = false
	let layout = false
	function modules(node: Node) {
		if (node.type === "mdxjsEsm") {
			let cursor = node.position?.start.offset ?? 0
			for (const statement of node.data?.estree?.body ?? []) {
				copy(cursor, statement.start)
				const defaultSpecifier =
					statement.type === "ExportNamedDeclaration"
						? statement.specifiers?.find(
								({ exported }) =>
									(exported.name ?? exported.value) === "default",
							)
						: undefined
				if (defaultSpecifier) {
					layout = true
					if (statement.source) {
						text += "import { "
						copy(defaultSpecifier.local.start, defaultSpecifier.local.end)
						text += " as __GalleyLayout } from "
						copy(statement.source.start, statement.source.end)
					} else {
						text += "const __GalleyLayout = "
						copy(defaultSpecifier.local.start, defaultSpecifier.local.end)
					}
					text += ";\n"
					const others = statement.specifiers!.filter(
						(item) => item !== defaultSpecifier,
					)
					if (others.length) {
						text += "export { "
						for (const [index, item] of others.entries()) {
							if (index) text += ", "
							copy(item.start, item.end)
						}
						text += " }"
						if (statement.source) {
							text += " from "
							copy(statement.source.start, statement.source.end)
						}
					}
				} else if (
					statement.type === "ExportDefaultDeclaration" &&
					statement.declaration
				) {
					layout = true
					text += "const __GalleyLayout = "
					copy(statement.declaration.start, statement.declaration.end)
				} else {
					if (statement.declaration?.id?.name === "Props") hasProps = true
					copy(statement.start, statement.end)
				}
				cursor = statement.end
				text += "\n;\n"
			}
			copy(cursor, node.position?.end.offset ?? cursor)
		}
		for (const child of node.children ?? []) modules(child)
	}
	modules(tree)
	text += `export default function __GalleyDocument(props: ${hasProps ? "Props" : "Record<string, never>"}): import("galley.md").Content {\nvoid props;\nreturn <>\n`
	function body(node: Node) {
		const start = node.position?.start.offset
		const end = node.position?.end.offset
		if (node.type === "mdxjsEsm" || node.type === "yaml") return
		if (start !== undefined && end !== undefined) {
			if (
				node.type === "mdxFlowExpression" ||
				node.type === "mdxTextExpression"
			) {
				copy(start, end)
				return
			}
			if (
				node.type === "mdxJsxFlowElement" ||
				node.type === "mdxJsxTextElement"
			) {
				const last = node.attributes?.at(-1)?.position?.end.offset ?? start
				const openEnd = source.indexOf(">", last) + 1
				copy(start, openEnd)
				if (source.slice(start, openEnd).endsWith("/>")) return
				for (const child of node.children ?? []) body(child)
				const closeStart = source.lastIndexOf("</", end - 2)
				copy(closeStart, end)
				return
			}
		}
		if (node.type === "text" || node.type === "inlineCode")
			text += `{${JSON.stringify(node.value ?? "")}}`
		else for (const child of node.children ?? []) body(child)
	}
	if (layout) text += "<__GalleyLayout {...props}>"
	body(tree)
	if (layout) text += "</__GalleyLayout>"
	text += "\n</>\n}\n"
	return { text, extension: ".tsx", mappings, diagnostics }
}
