/** Delay preview expressions until the renderer can catch failures at their source range. */
export function previewNodes() {
	return (tree: unknown) => {
		const guards = new Map<string, unknown[]>()
		function referenceName(value: unknown): string | undefined {
			if (!value || typeof value !== "object") return
			const node = value as {
				type?: string
				name?: string
				object?: unknown
				property?: unknown
			}
			if (node.type === "JSXIdentifier") return node.name
			if (node.type === "Identifier") return node.name
			if (
				node.type === "MemberExpression" ||
				node.type === "JSXMemberExpression"
			) {
				const object = referenceName(node.object)
				const property = referenceName(node.property)
				if (object && property) return `${object}.${property}`
			}
		}
		const wrappers = new Set(["galley-preview"])
		function extract(value: unknown) {
			if (!value || typeof value !== "object") return
			if (Array.isArray(value)) {
				for (let index = value.length - 1; index >= 0; index--) {
					const node = value[index]
					if (
						node?.type === "IfStatement" &&
						node.test?.type === "UnaryExpression" &&
						referenceName(node.test.argument) &&
						node.consequent?.type === "ExpressionStatement" &&
						node.consequent.expression?.callee?.name === "_missingMdxReference"
					) {
						const name = referenceName(node.test.argument)!
						guards.set(name, [node, ...(guards.get(name) ?? [])])
						value.splice(index, 1)
					} else extract(node)
				}
			} else {
				const node = value as {
					type?: string
					id?: { name?: string }
					init?: {
						type?: string
						object?: { name?: string }
						property?: { value?: string }
					}
				}
				if (
					node.type === "VariableDeclarator" &&
					node.id?.name &&
					node.init?.type === "MemberExpression" &&
					node.init.object?.name === "_components" &&
					node.init.property?.value === "galley-preview"
				)
					wrappers.add(node.id.name)
				Object.values(value).forEach(extract)
			}
		}
		extract(tree)
		function references(value: unknown, names: Set<string>) {
			if (Array.isArray(value)) value.forEach((item) => references(item, names))
			else if (value && typeof value === "object") {
				const node = value as Record<string, unknown>
				if (node.galleyPreviewThunk) return
				const name = referenceName(node)
				if (name) names.add(name)
				Object.values(node).forEach((item) => references(item, names))
			}
		}
		function visit(value: unknown) {
			if (Array.isArray(value)) {
				value.forEach(visit)
				return
			}
			if (!value || typeof value !== "object") return
			const node = value as Record<string, unknown>
			Object.values(node).forEach(visit)
			const opening = node.openingElement as
				| { name?: { name?: string } }
				| undefined
			if (
				node.type !== "JSXElement" ||
				!wrappers.has(opening?.name?.name ?? "")
			)
				return
			const names = new Set<string>()
			references(node.children, names)
			const checks = [...names].flatMap((name) => guards.get(name) ?? [])
			node.children = [
				{
					type: "JSXExpressionContainer",
					expression: {
						type: "ArrowFunctionExpression",
						galleyPreviewThunk: true,
						async: true,
						generator: false,
						expression: false,
						params: [],
						body: {
							type: "BlockStatement",
							body: [
								...checks,
								{
									type: "ReturnStatement",
									argument: {
										type: "JSXFragment",
										openingFragment: { type: "JSXOpeningFragment" },
										closingFragment: { type: "JSXClosingFragment" },
										children: node.children,
									},
								},
							],
						},
					},
				},
			]
		}
		visit(tree)
	}
}
