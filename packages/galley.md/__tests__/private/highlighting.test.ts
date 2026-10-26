import { readFile } from "node:fs/promises"
import { createHighlighter, type LanguageRegistration } from "shiki"
import { expect, test } from "vite-plus/test"
import source from "#fixtures/editor/highlighting.mdx" with { type: "text" }

test("highlighting keeps nested TSX code separate from Markdown and JSX children", async () => {
	const grammar = JSON.parse(
		await readFile(
			new URL("../../src/vscode/galley.tmLanguage.json", import.meta.url),
			"utf8",
		),
	) as LanguageRegistration
	grammar.name = "galley"
	const highlighter = await createHighlighter({
		themes: ["github-dark"],
		langs: ["tsx", "markdown", "yaml", grammar],
	})
	try {
		// Tokenize every line, including empty ones, as VS Code does. Shiki's
		// convenience API skips empty lines and cannot test blank-line boundaries.
		const tokenizer = highlighter.getLanguage("galley")
		let state: Parameters<typeof tokenizer.tokenizeLine>[1] = null
		const lines = source.split("\n").map((line) => {
			const result = tokenizer.tokenizeLine(line, state)
			state = result.ruleStack
			return result.tokens
		})
		const scopes = (text: string) => {
			const line = source.split("\n").findIndex((line) => line.includes(text))
			return lines[line]!.flatMap((token) => token.scopes)
		}
		for (const text of [
			"width: 160",
			"satisfies",
			"object.width as number",
			"return close as string",
		])
			expect(scopes(text)).toContain("meta.embedded.block.typescript")
		for (const text of [
			"Prose after code",
			"Markdown children",
			"Prose after expression",
		])
			expect(scopes(text), text).not.toContain("meta.embedded.block.typescript")
		expect(scopes("Markdown children")).toContain("markup.bold.markdown")
	} finally {
		highlighter.dispose()
	}
})
