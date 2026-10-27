import type { Root, RootContent } from "mdast"

type Node = {
	type: string
	children?: Node[]
	position?: { start: { offset: number }; end: { offset: number } }
	[key: string]: unknown
}

/** Preserve Markdown structure before MDX's HTML-oriented transform runs. */
export function markdownNodes(
	options: { previews?: boolean; recover?: boolean } = {},
) {
	return (tree: Root, file: { path: string }) => {
		function wrap(node: Node): Node {
			if (node.type.startsWith("mdx")) {
				let element: Node = {
					...node,
					...(node.children ? { children: node.children.map(wrap) } : {}),
				}
				if (
					options.previews &&
					node.position &&
					((/^mdxJsx(?:Flow|Text)Element$/.test(node.type) &&
						/^[A-Z]|\./.test(String(node.name))) ||
						node.type === "mdxFlowExpression" ||
						(options.recover && node.type === "mdxTextExpression"))
				) {
					element = {
						type:
							node.type === "mdxJsxTextElement" ||
							node.type === "mdxTextExpression"
								? "mdxJsxTextElement"
								: "mdxJsxFlowElement",
						name: "galley-preview",
						attributes: Object.entries({
							file: file.path,
							start: String(node.position.start.offset),
							end: String(node.position.end.offset),
						}).map(([name, value]) => ({
							type: "mdxJsxAttribute",
							name,
							value,
						})),
						children: [element],
					}
				}
				if (node.type === "mdxTextExpression") {
					return {
						type: "mdxJsxTextElement",
						name: "galley-expression",
						attributes: [],
						children: [element],
					}
				}
				return node.type === "mdxJsxFlowElement" ||
					node.type === "mdxFlowExpression"
					? {
							type: "mdxJsxFlowElement",
							name: "galley-flow",
							attributes: [],
							children: [element],
						}
					: element
			}
			const { children, position: _position, ...properties } = node
			return {
				type: "mdxJsxFlowElement",
				name: "galley-node",
				attributes: [
					{
						type: "mdxJsxAttribute",
						name: "node",
						value: JSON.stringify({
							...properties,
							...(children ? { children: [] } : {}),
						}),
					},
					...(node.type === "root"
						? [{ type: "mdxJsxAttribute", name: "file", value: file.path }]
						: []),
				],
				children: (children ?? []).map(wrap),
			}
		}
		const imports = tree.children.filter((node) => node.type === "mdxjsEsm")
		const children = tree.children.filter((node) => node.type !== "mdxjsEsm")
		tree.children = [
			...imports,
			wrap({
				type: "root",
				children: children as unknown as Node[],
			}) as unknown as RootContent,
		]
	}
}
