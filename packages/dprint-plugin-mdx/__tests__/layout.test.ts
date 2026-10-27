// SPDX-License-Identifier: MPL-2.0
import { compile } from "@mdx-js/mdx"
import { describe, expect, test } from "vite-plus/test"
import layoutVariants from "#fixtures/mdx-plugin/layout-variants.mdx" with { type: "text" }
import layoutCompact from "#fixtures/mdx-plugin/layout-compact.mdx" with { type: "text" }
import layoutExpanded from "#fixtures/mdx-plugin/layout-expanded.mdx" with { type: "text" }
import selfClosingVariants from "#fixtures/mdx-plugin/self-closing-variants.mdx" with { type: "text" }
import selfClosingContexts from "#fixtures/mdx-plugin/self-closing-contexts.mdx" with { type: "text" }
import expressionSpacing from "#fixtures/mdx-plugin/expression-spacing.mdx" with { type: "text" }
import whitespace from "#fixtures/mdx-plugin/whitespace.mdx" with { type: "text" }
import significantWhitespace from "#fixtures/mdx-plugin/whitespace-significant.mdx" with { type: "text" }
import { format, semantics } from "./support.ts"

describe("MDX formatting layouts", () => {
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
})
