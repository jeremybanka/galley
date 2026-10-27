// SPDX-License-Identifier: MPL-2.0
import { describe, expect, test } from "vite-plus/test"
import article from "#fixtures/mdx-plugin/conventional/article.mdx" with { type: "text" }
import components from "#fixtures/mdx-plugin/conventional/components.mdx" with { type: "text" }
import conventionalExpressions from "#fixtures/mdx-plugin/conventional/expressions.mdx" with { type: "text" }
import modules from "#fixtures/mdx-plugin/conventional/modules.mdx" with { type: "text" }
import fragments from "#fixtures/mdx-plugin/conventional/fragments.mdx" with { type: "text" }
import gfm from "#fixtures/mdx-plugin/conventional/gfm.mdx" with { type: "text" }
import frontmatter from "#fixtures/mdx-plugin/conventional/frontmatter.mdx" with { type: "text" }
import containers from "#fixtures/mdx-plugin/conventional/containers.mdx" with { type: "text" }
import commentsAndEntities from "#fixtures/mdx-plugin/conventional/comments-and-entities.mdx" with { type: "text" }
import { format, compiledSemantics } from "./support.ts"

describe("Conventional MDX", () => {
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
		// Exercise every document at the default width. Narrow JSX layouts need
		// an additional semantic check; the layout suite owns the wider matrix.
		const widths = [
			"components",
			"expressions",
			"modules",
			"fragments",
		].includes(name)
			? [40, 80]
			: [80]
		test.each(widths)(
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
})
