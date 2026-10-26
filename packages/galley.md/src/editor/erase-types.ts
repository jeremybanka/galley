import { transformSync } from "esbuild"
import type { Root } from "mdast"
import { typescriptParser } from "./typescript.ts"

/** Erase types only for execution; the editor projects the original TSX. */
export function eraseTypes() {
	return (tree: Root) => {
		type Node = {
			type: string
			value?: unknown
			data?: { estree?: unknown }
			children?: Node[]
			attributes?: Node[]
		}
		function visit(node: Node) {
			if (node.data?.estree && typeof node.value === "string") {
				const module = node.type === "mdxjsEsm"
				const spread = node.type === "mdxJsxExpressionAttribute"
				const value = module
					? node.value
					: `const __value = (${spread ? `{${node.value}}` : node.value || "undefined"});`
				// An MDX comment is an empty expression, not an undefined value.
				if (
					!module &&
					!spread &&
					(node.data.estree as { body: unknown[] }).body.length === 0
				)
					return
				const { code } = transformSync(value, {
					loader: "tsx",
					jsx: "preserve",
					target: "esnext",
					tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
				})
				const program = typescriptParser.parse(code, {
					ecmaVersion: "latest",
					sourceType: "module",
				})
				if (!module) {
					const declaration = program.body[0]
					if (declaration?.type !== "VariableDeclaration")
						throw new Error("Invalid MDX expression projection.")
					program.body = [
						{
							type: "ExpressionStatement",
							expression: declaration.declarations[0]!.init!,
							start: 0,
							end: code.length,
						},
					]
				}
				node.data.estree = unwrapParentheses(program)
			}
			if (node.value && typeof node.value === "object")
				visit(node.value as Node)
			for (const child of [
				...(node.children ?? []),
				...(node.attributes ?? []),
			])
				visit(child)
		}
		visit(tree as Node)
	}
}

// ESTree printers reconstruct grouping from precedence. Babel's explicit
// parenthesis nodes are useful for micromark boundaries but not part of ESTree.
function unwrapParentheses(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(unwrapParentheses)
	if (!value || typeof value !== "object") return value
	const node = value as Record<string, unknown>
	if (node.type === "ParenthesizedExpression")
		return unwrapParentheses(node.expression)
	for (const key of Object.keys(node)) node[key] = unwrapParentheses(node[key])
	return node
}
