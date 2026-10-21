import type {
	AlignType,
	PhrasingContent,
	RootContent,
	Table,
	TableCell,
	TableRow,
} from "mdast"

import type { Content, Element } from "./types.ts"

const tags = new Set(["table", "thead", "tbody", "tr", "th", "td"])
const unsupported = new Set(["caption", "colgroup", "col", "tfoot"])
const headers = new WeakSet<TableRow>()
const headerCells = new WeakSet<TableCell>()
const alignment = new WeakMap<TableCell, AlignType>()
const inline = new Set([
	"text",
	"emphasis",
	"strong",
	"delete",
	"inlineCode",
	"link",
	"linkReference",
	"image",
	"imageReference",
	"footnoteReference",
])

function structure(nodes: RootContent[]): RootContent[] {
	return nodes.filter(
		(node) => node.type !== "text" || node.value.trim() !== "",
	)
}

function cellContent(nodes: RootContent[]): PhrasingContent[] {
	// MDX wraps prose inside flow elements in a paragraph.
	if (nodes.length === 1 && nodes[0]?.type === "paragraph")
		nodes = nodes[0].children
	return nodes.map((node) => {
		if (!inline.has(node.type))
			throw new Error(
				`Table cells support inline content only; found ${node.type}. Lists, nested tables, HTML, and hard line breaks cannot be represented in a Markdown table.`,
			)
		if (node.type === "text" || node.type === "inlineCode")
			return { ...node, value: node.value.replace(/\r\n|[\r\n]/g, " ") }
		if ("children" in node)
			return {
				...node,
				children: cellContent(node.children),
			} as PhrasingContent
		return node as PhrasingContent
	})
}

/** Translate native table elements while retaining header semantics until assembly. */
export async function renderTableElement(
	element: Element,
	parent: string | undefined,
	resolve: (content: Content, parent: string) => Promise<RootContent[]>,
): Promise<RootContent[] | undefined> {
	const tag = String(element.type)
	if (unsupported.has(tag))
		throw new Error(
			`Unsupported table element <${tag}>. Markdown tables support table, thead, tbody, tr, th, and td only.`,
		)
	if (!tags.has(tag)) {
		if (parent && ["table", "thead", "tbody", "tr"].includes(parent))
			throw new Error(
				`Unsupported element <${tag}> inside <${parent}>. Use table rows and cells.`,
			)
		return undefined
	}
	const allowedParents: Record<string, string[]> = {
		thead: ["table"],
		tbody: ["table"],
		tr: ["table", "thead", "tbody"],
		th: ["tr"],
		td: ["tr"],
	}
	if (tag !== "table" && !allowedParents[tag]?.includes(parent ?? ""))
		throw new Error(
			`<${tag}> must be inside ${allowedParents[tag]?.map((name) => `<${name}>`).join(" or ")}.`,
		)
	if (tag === "table" && parent)
		throw new Error("Nested tables cannot be represented in a Markdown table.")
	for (const attribute of Object.keys(element.props)) {
		if (
			attribute === "children" ||
			attribute === "key" ||
			(tag === "th" && attribute === "align")
		)
			continue
		throw new Error(
			`Unsupported attribute "${attribute}" on <${tag}>. Markdown tables support only align on <th>; use align="left", "center", or "right". Merged cells and HTML styling are not supported.`,
		)
	}
	const align = element.props.align
	if (
		align !== undefined &&
		align !== "left" &&
		align !== "center" &&
		align !== "right"
	)
		throw new Error(
			'Invalid <th> alignment. Use align="left", "center", or "right".',
		)
	const children = await resolve(element.props.children as Content, tag)
	if (tag === "th" || tag === "td") {
		const cell: TableCell = {
			type: "tableCell",
			children: cellContent(children),
		}
		if (tag === "th") headerCells.add(cell)
		if (align !== undefined) alignment.set(cell, align)
		return [cell]
	}
	const content = structure(children)
	if (tag === "tr") {
		if (!content.length || content.some((node) => node.type !== "tableCell"))
			throw new Error("<tr> must contain one or more <th> or <td> cells.")
		const cells = content as TableCell[]
		const header = cells.every((cell) => headerCells.has(cell))
		if (!header && cells.some((cell) => headerCells.has(cell)))
			throw new Error(
				"A table row cannot mix <th> and <td>. Use <th> for the header row and <td> for body rows.",
			)
		const row: TableRow = { type: "tableRow", children: cells }
		if (header) headers.add(row)
		return [row]
	}
	if (content.some((node) => node.type !== "tableRow"))
		throw new Error(
			`<${tag}> must contain table rows${tag === "table" ? " or thead/tbody sections" : ""}.`,
		)
	const rows = content as TableRow[]
	if (tag === "thead") {
		if (rows.length !== 1 || !headers.has(rows[0]!))
			throw new Error(
				"<thead> must contain exactly one header row of <th> cells.",
			)
		return rows
	}
	if (tag === "tbody") {
		if (rows.some((row) => headers.has(row)))
			throw new Error("<tbody> must contain only body rows of <td> cells.")
		return rows
	}
	const first = rows[0]
	if (
		!first ||
		!headers.has(first) ||
		rows.slice(1).some((row) => headers.has(row))
	)
		throw new Error(
			"<table> requires exactly one header row of <th> cells first, followed by body rows of <td> cells.",
		)
	for (const [index, row] of rows.entries()) {
		if (row.children.length !== first.children.length)
			throw new Error(
				`Table row ${index + 1} has ${row.children.length} cells; expected ${first.children.length} to match the header.`,
			)
	}
	return [
		{
			type: "table",
			align: first.children.map((cell) => alignment.get(cell) ?? null),
			children: rows,
		},
	]
}

/** Give partial row/cell components a valid table for their editor preview. */
export function tablePreview(
	nodes: RootContent[],
	parent: string | undefined,
): RootContent[] {
	if (!parent || !["table", "thead", "tbody", "tr"].includes(parent))
		return nodes
	const content = structure(nodes)
	if (!content.length) return []
	const rows: TableRow[] =
		parent === "tr"
			? [{ type: "tableRow", children: content as TableCell[] }]
			: (content as TableRow[])
	if (
		rows.some(
			(row) =>
				row.type !== "tableRow" ||
				row.children.some((cell) => cell.type !== "tableCell"),
		)
	)
		return nodes
	const first = rows[0]!
	const table: Table = {
		type: "table",
		align: first.children.map((cell) => alignment.get(cell) ?? null),
		children: headers.has(first)
			? rows
			: [
					{
						type: "tableRow",
						children: first.children.map(() => ({
							type: "tableCell",
							children: [],
						})),
					},
					...rows,
				],
	}
	return [table]
}
