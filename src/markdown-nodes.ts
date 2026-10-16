import type { Root, RootContent } from "mdast"

type Node = {
	type: string
	children?: Node[]
	position?: unknown
	[key: string]: unknown
}

/** Preserve Markdown structure before MDX's HTML-oriented transform runs. */
export function markdownNodes() {
	return (tree: Root, file: { path: string }) => {
		function wrap(node: Node): Node {
			if (node.type.startsWith("mdx")) {
				const element = {
					...node,
					...(node.children ? { children: node.children.map(wrap) } : {}),
				}
				if (node.type === "mdxTextExpression") {
					return {
						type: "mdxJsxTextElement",
						name: "md-x-expression",
						attributes: [],
						children: [element],
					}
				}
				return node.type === "mdxJsxFlowElement" ||
					node.type === "mdxFlowExpression"
					? {
							type: "mdxJsxFlowElement",
							name: "md-x-flow",
							attributes: [],
							children: [element],
						}
					: element
			}
			const { children, position: _position, ...properties } = node
			return {
				type: "mdxJsxFlowElement",
				name: "md-x-node",
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
