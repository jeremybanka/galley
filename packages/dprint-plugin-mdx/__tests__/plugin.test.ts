// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process"
import { closeSync, openSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createFromBuffer } from "@dprint/formatter"
import { compile, createProcessor } from "@mdx-js/mdx"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import { describe, expect, test } from "vite-plus/test"
import layoutVariants from "#fixtures/mdx-plugin/layout-variants.mdx" with { type: "text" }
import layoutCompact from "#fixtures/mdx-plugin/layout-compact.mdx" with { type: "text" }
import layoutExpanded from "#fixtures/mdx-plugin/layout-expanded.mdx" with { type: "text" }
import selfClosingVariants from "#fixtures/mdx-plugin/self-closing-variants.mdx" with { type: "text" }
import selfClosingContexts from "#fixtures/mdx-plugin/self-closing-contexts.mdx" with { type: "text" }
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
import expressionSpacing from "#fixtures/mdx-plugin/expression-spacing.mdx" with { type: "text" }
import whitespace from "#fixtures/mdx-plugin/whitespace.mdx" with { type: "text" }
import significantWhitespace from "#fixtures/mdx-plugin/whitespace-significant.mdx" with { type: "text" }
import plain from "#fixtures/mdx-plugin/plain.mdx" with { type: "text" }
import article from "#fixtures/mdx-plugin/conventional/article.mdx" with { type: "text" }
import components from "#fixtures/mdx-plugin/conventional/components.mdx" with { type: "text" }
import conventionalExpressions from "#fixtures/mdx-plugin/conventional/expressions.mdx" with { type: "text" }
import modules from "#fixtures/mdx-plugin/conventional/modules.mdx" with { type: "text" }
import fragments from "#fixtures/mdx-plugin/conventional/fragments.mdx" with { type: "text" }
import gfm from "#fixtures/mdx-plugin/conventional/gfm.mdx" with { type: "text" }
import frontmatter from "#fixtures/mdx-plugin/conventional/frontmatter.mdx" with { type: "text" }
import containers from "#fixtures/mdx-plugin/conventional/containers.mdx" with { type: "text" }
import commentsAndEntities from "#fixtures/mdx-plugin/conventional/comments-and-entities.mdx" with { type: "text" }

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

describe("MDX WebAssembly plugin", () => {
	for (const [name, source] of Object.entries({
		article,
		components,
		expressions: conventionalExpressions,
		modules,
		fragments,
		gfm,
		frontmatter,
		containers,
		commentsAndEntities,
	})) {
		test.each([40, 80, 120])(
			`formats conventional MDX without changing its meaning: ${name}, width %i`,
			async (lineWidth) => {
				// Both sides must compile with the standard MDX compiler, without
				// Galley's TypeScript parser or runtime.
				const original = await compiledSemantics(source)
				const config = { lineWidth }
				const result = format(source, config)
				// Every document contains an untidy heading. A silent fallback to
				// the input must not count as successful formatting.
				expect(result).not.toBe(source)
				expect(result).not.toMatch(/^# {2,}/m)
				// Compare compiled trees so the official compiler, rather than our
				// test helper, decides which JSX whitespace affects runtime output.
				expect(await compiledSemantics(result)).toEqual(original)
				expect(format(result, config)).toBe(result)
			},
		)
	}

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
		expect(result).toContain("# Keep this Markdown inside JSX")
		expect(result).toContain('import Card from "./card.js";')
		expect(result).toContain('title: "MDX: {safe}"')
	})

	test("collapses blank lines, repeated spaces, and trailing spaces around MDX", async () => {
		const result = format(whitespace)
		expect(result).not.toBe(whitespace)
		expect(result).toContain("# Spacing\n\nWords with spaces and ")
		expect(result).toContain('<Card title="keep  these  spaces" width={160} />')
		expect(result).toContain("Inline <Card />\n")
		expect(result).toContain("Some Markdown text.\n\n</Card>\n\n{1 + 2}\n")
		expect(result).not.toMatch(/\n{3}|[ \t]+$/m)
		expect(result.startsWith("import ")).toBe(true)
		expect(result.endsWith("\n\n")).toBe(false)
		for (const suffix of [" \t", "\n\n \t"]) {
			const padded = format(whitespace + suffix)
			expect(padded).toBe(result)
			expect(format(padded)).toBe(padded)
		}
		expect(format(result)).toBe(result)
		await expect(compile(result)).resolves.toBeDefined()
		const windows = format(whitespace.replaceAll("\n", "\r\n"), {
			newLineKind: "crlf",
		})
		expect(windows).not.toMatch(/(?<!\r)\n|(?:\r\n){3}|[ \t]+(?=\r?$)/m)
		expect(format(windows, { newLineKind: "crlf" })).toBe(windows)
	})

	test("collapses expression padding, parentheses, and prop separators", async () => {
		const result = format(expressionSpacing)
		expect(result).toContain("Before {1 + 2} after.")
		expect(result).toContain("\n{1}\n")
		expect(result).toContain("\n{2 + 3}\n")
		expect(result).toContain('<Card width={160} title="keep   spaces" />')
		expect(result).toContain("width={160}\n")
		expect(result).toContain("height={90}\n")
		expect(result).toContain("[Label {1 + 2} end](./guide)")
		expect(result).toContain("{/* comment */}")
		expect(result).toContain('"keep = { these   spaces }"')
		expect(result).toContain('title="keep = { literal   spaces }" width={160}')
		expect(result).toContain("`keep = { inline   code }`")
		expect(result).toContain("```text\n<Card   width = { 160 } />\n```")
		expect(result).not.toMatch(/\n[ \t]*\n[ \t]*(?:width|height|\/>)/)
		expect(format(result)).toBe(result)
		await expect(compile(result)).resolves.toBeDefined()
		const windows = format(expressionSpacing.replaceAll("\n", "\r\n"), {
			newLineKind: "crlf",
		})
		expect(windows).toContain("\r\n{1}\r\n")
		expect(windows).not.toMatch(/(?<!\r)\n/)
		expect(format(windows, { newLineKind: "crlf" })).toBe(windows)
	})

	test("preserves literal and ignored whitespace and keeps hard breaks without trailing spaces", () => {
		const result = format(significantWhitespace)
		for (const text of [
			"`keep   inline  code`",
			'"keep   string  spaces"',
			"```text\nkeep   code   \n\n\nkeep blank lines\n```",
			"<pre>\nkeep   preformatted   \n\n\ntext\n</pre>",
			'data-multiline="keep   \n\n  literal spaces"',
			'title="keep   attribute   "',
			"`keep   template   `",
			'Keep    ignored   \n\n\n<Widget    title="untouched" />',
			"Keep    this   \n",
			"- First item.\n\n  Second paragraph.",
			'[the guide](./guide "keep   link title")',
			'![keep   alt](./image.png "keep   image title")',
		])
			expect(result).toContain(text)
		expect(result).toContain("Two-space break.\\\nNext line.")
		expect(result).toContain("Escaped break.\\\nNext line.")
		expect(result).toContain("> Quoted words.")
		const breaks = (source: string) =>
			JSON.stringify(semantics(source)).match(/"type":"break"/g)?.length
		expect(breaks(result)).toBe(2)
		expect(breaks(result)).toBe(breaks(significantWhitespace))
		expect(format(result)).toBe(result)
	})

	test.each([40, 80, 120, 200])(
		"converges equivalent TypeScript layouts at width %i",
		(lineWidth) => {
			const config = { lineWidth }
			const variants = layoutVariants.trim().split(/\n\n+/)
			const results = variants.map((source) => format(source + "\n", config))
			expect(new Set(results).size).toBe(1)
			for (const [index, result] of results.entries()) {
				expect(format(result, config)).toBe(result)
				expect(semantics(result)).toEqual(semantics(variants[index]!))
			}
			const compact = format(layoutCompact, config)
			const expanded = format(layoutExpanded, config)
			expect(expanded).toBe(compact)
			expect(format(compact, config)).toBe(compact)
			expect(semantics(compact)).toEqual(semantics(layoutCompact))
			expect(semantics(expanded)).toEqual(semantics(layoutExpanded))
		},
	)

	test.each([8, 80, 120])(
		"canonicalizes self-closing JSX at width %i",
		(lineWidth) => {
			const variants = selfClosingVariants.trim().split(/\n\n(?=<)/)
			for (const source of variants) {
				const result = format(source, { lineWidth })
				expect(result).toBe("<TypeScript />\n")
				expect(format(result, { lineWidth })).toBe(result)
				expect(semantics(result)).toEqual(semantics(source))
			}
		},
	)

	test("normalizes self-closing tags in context while preserving literals and ignores", () => {
		const result = format(selfClosingContexts)
		for (const text of [
			"<UI.Icon />",
			"<svg:path />",
			"<Outer><Inner /></Outer>",
			"Before <TypeScript /> after.",
			'<Card title="keep   spaces" width={160} />',
		])
			expect(result).toContain(text)
		for (const text of [
			"`<TypeScript/>`",
			"```text\n<TypeScript/>\n```",
			"{/* dprint-ignore */}\n<TypeScript\n/>",
		])
			expect(result).toContain(text)
		expect(semantics(result)).toEqual(semantics(selfClosingContexts))
		expect(format(result)).toBe(result)
		const windows = format(selfClosingVariants.replaceAll("\n", "\r\n"), {
			newLineKind: "crlf",
		})
		expect(windows).not.toMatch(/(?<!\r)\n|<TypeScript\r\n/)
		expect(format(windows, { newLineKind: "crlf" })).toBe(windows)
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
