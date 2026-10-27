// cspell:ignore widht
import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { compileMarkdown, previewMarkdown, Markdown } from "../../src/index.ts"
import { fixture, execute, root } from "./editor-support.ts"
import source from "#fixtures/compiler/native-jsx.mdx" with { type: "text" }
import component from "#fixtures/compiler/native-markup.tsx" with { type: "text" }
import invalid from "#fixtures/editor/native-invalid.mdx" with { type: "text" }
import event from "#fixtures/compiler/native-event.mdx" with { type: "text" }
import blockCell from "#fixtures/compiler/native-block-cell.mdx" with { type: "text" }

test("native JSX preserves HTML while authored Markdown and explicit tables stay Markdown", async () => {
	const { directory, input } = await fixture(source)
	await fs.writeFile(path.join(directory, "native-markup.tsx"), component)
	const result = await previewMarkdown(input)
	expect(await compileMarkdown(input)).toBe(result.markdown)
	expect(result.markdown).toContain("# Markdown heading\n")
	expect(result.markdown).toContain(
		'Markdown **emphasis** and an inline <span title="label">HTML <strong>label</strong></span> stay together.',
	)
	expect(result.markdown).toContain("<h1><code>galley</code></h1>")
	expect(result.markdown).toContain(
		'<img src="logo.png" width="160" alt="A &#x26; B">',
	)
	expect(result.markdown).toContain(
		'<input disabled aria-hidden="false" data-count="2">',
	)
	expect(result.markdown).toContain(
		'<label for="name" style="color: red">Name</label>',
	)
	expect(result.markdown).toContain(
		'<custom-badge data-label="example"></custom-badge>',
	)
	expect(result.markdown).toContain(
		'<section class="note"><h2>Nested Markdown</h2><p>Some <strong>bold</strong> text.</p></section>',
	)
	expect(result.markdown).toContain(
		'<table class="layout"><caption>Layout</caption><tr><td colspan="2">Merged</td></tr></table>',
	)
	expect(result.markdown).toContain(
		'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" stroke-width="2"></circle></svg>',
	)
	expect(result.markdown).toContain(
		'<svg><foreignObject width="10" height="10"><div class="embedded">HTML</div></foreignObject></svg>',
	)
	expect(result.markdown).toContain(
		'href="https://example.com/?a=1&#x26;b=2" title="link"',
	)
	expect(result.markdown).toContain("After **Markdown**.")
	const tables = Markdown({ children: result.markdown }).children.filter(
		(node) => node.type === "table",
	)
	expect(tables).toHaveLength(1)
	expect(tables[0]?.align).toEqual([null, "right"])
	expect(tables[0]?.children).toHaveLength(3)
	expect(
		result.components.some((item) => item.markdown.includes("| Name")),
	).toBe(true)
})

test("native HTML and SVG attributes typecheck in MDX and TSX without allowing unknown props", async () => {
	const { directory, input } = await fixture(source)
	await fs.writeFile(path.join(directory, "native-markup.tsx"), component)
	const check = () =>
		execute(process.execPath, [
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		])
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	await fs.appendFile(input, `\n${invalid}`)
	const failure = await check().then(
		() => "",
		(error: { stdout: string }) => error.stdout,
	)
	for (const property of ["widht", "onClick", "color", "invalid"])
		expect(failure).toContain(property)
}, 20_000)

test.each([event, blockCell])(
	"rejects unsupported static output and block HTML inside pipe table cells",
	async (document) => {
		const { input } = await fixture(document)
		await expect(compileMarkdown(input)).rejects.toThrow()
	},
)
