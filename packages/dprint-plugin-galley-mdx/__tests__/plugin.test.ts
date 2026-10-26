// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process"
import { closeSync, openSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createFromBuffer } from "@dprint/formatter"
import { compile, createProcessor } from "@mdx-js/mdx"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import { describe, expect, test } from "vite-plus/test"
import attributes from "#fixtures/mdx-plugin/attributes.mdx" with { type: "text" }
import boundary from "#fixtures/mdx-plugin/boundary.mdx" with { type: "text" }
import crlf from "#fixtures/mdx-plugin/crlf.mdx" with { type: "text" }
import escaped from "#fixtures/mdx-plugin/escaped.mdx" with { type: "text" }
import expressions from "#fixtures/mdx-plugin/expressions.mdx" with { type: "text" }
import fences from "#fixtures/mdx-plugin/fences.mdx" with { type: "text" }
import ignore from "#fixtures/mdx-plugin/ignore.mdx" with { type: "text" }
import ignoreFile from "#fixtures/mdx-plugin/ignore-file.mdx" with { type: "text" }
import invalid from "#fixtures/mdx-plugin/invalid.mdx" with { type: "text" }
import mixed from "#fixtures/mdx-plugin/mixed.mdx" with { type: "text" }
import nested from "#fixtures/mdx-plugin/nested.mdx" with { type: "text" }
import plain from "#fixtures/mdx-plugin/plain.mdx" with { type: "text" }

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

// Observe semantics using the independent JavaScript MDX implementation.
function semantics(source: string): unknown {
	function normalize(value: unknown): unknown {
		if (Array.isArray(value)) return value.map(normalize)
		if (!value || typeof value !== "object") return value
		const node = value as Record<string, unknown>
		if (node.type === "ParenthesizedExpression")
			return normalize(node.expression)
		const result = Object.fromEntries(
			Object.entries(node)
				.filter(
					([key]) =>
						![
							"position",
							"data",
							"start",
							"end",
							"loc",
							"range",
							"raw",
						].includes(key),
				)
				.map(([key, value]) => [key, normalize(value)]),
		)
		const estree = (node.data as { estree?: unknown } | undefined)?.estree
		if (estree) result.value = normalize(estree)
		return result
	}
	return normalize(processor.parse(source))
}

describe("MDX WebAssembly plugin", () => {
	test("identifies itself separately from the official Markdown plugin", () => {
		const plugin = formatter()
		expect(plugin.getPluginInfo()).toMatchObject({
			name: manifest.name,
			version: manifest.version,
			configKey: "mdx",
		})
		expect(plugin.getPluginInfo().updateUrl).toBeNull()
		expect(plugin.getFileMatchingInfo().fileExtensions).toEqual(["mdx"])
		expect(plugin.getConfigDiagnostics()).toEqual([])
		expect(plugin.getLicenseText()).toContain("Mozilla Public License")
		expect(plugin.getLicenseText()).toContain("David Sherret")
		expect(plugin.getLicenseText()).toContain("GitHub, Inc.")
	})

	test("formats Markdown without turning expression props into string props", async () => {
		const result = format(attributes)
		expect(result).toContain("# Attributes\n")
		expect(result).toContain('width={160} height="{160}"')
		const javascript = String(await compile(result))
		expect(javascript).toMatch(/width: 160/)
		expect(javascript).toMatch(/height: "\{160\}"/)
	})

	for (const [name, source] of Object.entries({
		mixed,
		attributes,
		boundary,
		crlf,
		escaped,
		expressions,
		nested,
		plain,
	})) {
		test(`preserves MDX semantics and is idempotent: ${name}`, () => {
			const result = format(source)
			expect(semantics(result)).toEqual(semantics(source))
			expect(format(result)).toBe(result)
		})
	}

	test("formats headings and lists around protected MDX blocks", () => {
		const result = format(mixed)
		expect(result).toContain("# Hello 世界\n")
		expect(result).toContain("- **Markdown** outside JSX")
		expect(result).toContain("#   Keep this Markdown inside JSX")
		expect(result).toContain('import Card from "./card.js";')
		expect(result).toContain('title: "MDX: {safe}"')
	})

	test("supports MDX ignore comments", () => {
		const result = format(ignore)
		expect(result).toContain("#   Keep this heading   #")
		expect(result).toContain("# Format this heading\n")
		expect(result).toContain("*   Keep this list")
		expect(result).toContain("#   Keep this too   #")
		expect(result).toContain("# Format after region\n")
		expect(format(ignoreFile)).toBe(ignoreFile)
	})

	test("rejects invalid MDX and leaves partial ranges unchanged", () => {
		expect(() => format(invalid)).toThrow()
		expect(
			formatter().formatText({
				filePath: "example.mdx",
				fileText: attributes,
				bytesRange: [0, 8],
			}),
		).toBe(attributes)
	})

	test("respects Markdown configuration and reports invalid options", () => {
		expect(format(plain, { "list.unorderedMarker": "asterisks" })).toContain(
			"* one",
		)
		expect(
			formatter({ unknownOption: true }).getConfigDiagnostics(),
		).not.toEqual([])
	})

	test("delegates code fences through the dprint host", () => {
		const plugin = formatter()
		plugin.setHostFormatter(({ filePath, fileText }) =>
			filePath.endsWith(".json") ? '{ "a": 1 }\n' : format(fileText),
		)
		const result = plugin.formatText({
			filePath: "example.mdx",
			fileText: fences,
		})
		expect(result).toContain('{ "a": 1 }')
		expect(result).toContain("# Nested example\n")
		expect(result).toContain("<svg width={160} />")
		expect(
			plugin.formatText({ filePath: "example.mdx", fileText: result }),
		).toBe(result)
	})

	test("works through the dprint CLI with this repository's plugin routing", () => {
		const root = fileURLToPath(new URL("../../..", import.meta.url))
		const input = openSync(
			new URL(
				"../../galley.md/__tests__/fixtures/mdx-plugin/attributes.mdx",
				import.meta.url,
			),
			"r",
		)
		let result: string
		try {
			result = execFileSync(
				"dprint",
				["fmt", "--stdin", "example.mdx", "--config", `${root}/dprint.json`],
				{
					cwd: root,
					stdio: [input, "pipe", "pipe"],
					encoding: "utf8",
					timeout: 60_000,
				},
			)
		} finally {
			closeSync(input)
		}
		expect(result).toContain("# Attributes\n")
		expect(result).toContain("width={160}")
	})
})
