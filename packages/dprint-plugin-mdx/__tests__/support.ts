// SPDX-License-Identifier: MPL-2.0
import { readFileSync } from "node:fs"
import { createFromBuffer } from "@dprint/formatter"
import { compile, createProcessor } from "@mdx-js/mdx"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import { expect } from "vite-plus/test"

const bytes = readFileSync(new URL("../plugin.wasm", import.meta.url))

const manifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { name: string; version: string }

const processor = createProcessor({
	remarkPlugins: [remarkGfm, remarkFrontmatter],
})

function formatter(config: Record<string, unknown> = {}) {
	const result = createFromBuffer(bytes)
	result.setConfig({ lineWidth: 80 }, config)
	return result
}

function format(source: string, config: Record<string, unknown> = {}) {
	return formatter(config).formatText({
		filePath: "example.mdx",
		fileText: source,
	})
}

function normalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalize)
	if (!value || typeof value !== "object") return value
	const node = value as Record<string, unknown>
	if (node.type === "ParenthesizedExpression") return normalize(node.expression)
	const result = Object.fromEntries(
		Object.entries(node)
			.filter(
				([key]) =>
					!["position", "data", "start", "end", "loc", "range", "raw"].includes(
						key,
					),
			)
			.map(([key, value]) => [key, normalize(value)]),
	)
	const estree = (node.data as { estree?: unknown } | undefined)?.estree
	if (estree) result.value = normalize(estree)
	return result
}

function semantics(source: string): unknown {
	return normalize(processor.parse(source))
}

async function compiledSemantics(source: string): Promise<unknown> {
	let result: unknown
	await compile(source, {
		remarkPlugins: [remarkGfm, remarkFrontmatter],
		recmaPlugins: [
			() => (tree: unknown) => {
				result = normalize(tree)
			},
		],
	})
	expect(result).toMatchObject({ type: "Program" })
	return result
}

export { formatter, format, semantics, compiledSemantics, manifest }
