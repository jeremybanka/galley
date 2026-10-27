import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { compileMarkdown, runGalley } from "galley.md"
import { fixture, parseMarkdown, runCli } from "./support.ts"

import emptyModule from "#fixtures/public/compiler/empty-module.ts" with { type: "text" }
import invalidLanguage from "#fixtures/public/compiler/invalid/language.mdx" with { type: "text" }
import unsupportedElement from "#fixtures/public/compiler/invalid/element.mdx" with { type: "text" }
import missingCells from "#fixtures/public/compiler/table-errors/missing-cells.mdx" with { type: "text" }
import plainMarkdown from "#fixtures/public/compiler/plain.md" with { type: "text" }
import markdownImports from "#fixtures/public/compiler/markdown-imports.mdx" with { type: "text" }
import markdownStructure from "#fixtures/public/compiler/markdown-structure.mdx" with { type: "text" }
import alignedTable from "#fixtures/public/compiler/aligned-table.mdx" with { type: "text" }
import alignedTableExpected from "#fixtures/public/compiler/aligned-table.expected.md" with { type: "text" }
import codeSource from "#fixtures/public/compiler/code-source.ts" with { type: "text" }
import codeImports from "#fixtures/public/compiler/code-imports.mdx" with { type: "text" }
import runtimeSource from "#fixtures/public/compiler/runtime-source.ts" with { type: "text" }
import rawNote from "#fixtures/public/compiler/note.txt" with { type: "text" }
import mixedImports from "#fixtures/public/compiler/mixed-imports.mdx" with { type: "text" }
import nestedDocument from "#fixtures/public/compiler/nested-document.mdx" with { type: "text" }
import nestedSection from "#fixtures/public/compiler/nested-section.mdx" with { type: "text" }
import greeting from "#fixtures/public/compiler/greeting.tsx" with { type: "text" }
import pluginImports from "#fixtures/public/compiler/plugin-imports.mdx" with { type: "text" }
import pluginComponent from "#fixtures/public/compiler/plugin-component.ts" with { type: "text" }
import changingComponent from "#fixtures/public/compiler/changing-component.mdx" with { type: "text" }
import beforeComponent from "#fixtures/public/compiler/before.ts" with { type: "text" }
import afterComponent from "#fixtures/public/compiler/after.ts" with { type: "text" }
import generatedDocument from "#fixtures/public/compiler/generated.mdx" with { type: "text" }
import cliDocument from "#fixtures/public/compiler/cli.mdx" with { type: "text" }
import brokenDocument from "#fixtures/public/compiler/invalid/broken.mdx" with { type: "text" }

test("keeps inline expression whitespace and treats Markdown imports as data", async () => {
	const markdown = plainMarkdown
	const { input } = await fixture({
		"plain.md": markdown,
		"README.mdx": markdownImports,
	})
	const output = await compileMarkdown(input)
	expect(parseMarkdown(output).children[0]).toEqual(
		parseMarkdown("a\nb").children[0],
	)
	expect(parseMarkdown(output).children).toEqual(
		expect.arrayContaining(parseMarkdown(markdown).children),
	)
	const code = parseMarkdown(output).children.find(
		(node) => node.type === "code",
	)
	expect(code?.value).toBe(markdown)
})

test("preserves Markdown structure including references, footnotes, tasks, and tables", async () => {
	const source = markdownStructure
	const { input } = await fixture({ "README.mdx": source })
	expect(parseMarkdown(await compileMarkdown(input))).toEqual(
		parseMarkdown(source),
	)
})

test("compiles native tables with column alignment, inline Markdown, and escaped cells", async () => {
	const { input } = await fixture({
		"README.mdx": alignedTable,
	})
	const output = await compileMarkdown(input)
	expect(parseMarkdown(output)).toEqual(parseMarkdown(alignedTableExpected))
	expect(output).not.toContain("<table>")
})

test("imports one source as distinct code components, reuses identical attributes, and never executes it", async () => {
	const source = codeSource
	const { input } = await fixture({
		"code-source.ts": source,
		"README.mdx": codeImports,
	})
	const output = await compileMarkdown(input)
	expect(output).toContain("identity passed")
	expect(output).not.toContain("identity failed")
	expect(
		parseMarkdown(output)
			.children.filter((node) => node.type === "code")
			.map(({ value, lang }) => ({ value, lang })),
	).toEqual([
		{ value: source, lang: "ts" },
		{ value: source, lang: "text" },
		{ value: source, lang: "ts" },
	])
})

test("loads ordinary TypeScript and raw text imports alongside code imports", async () => {
	const { input } = await fixture({
		"example.ts": runtimeSource,
		"note.txt": rawNote,
		"README.mdx": mixedImports,
	})
	const output = await compileMarkdown(input)
	expect(output).toContain("runtime value and a raw string")
	expect(output).toContain('export const value: string = "runtime value"')
})

test("supports async components, props, TSX, and nested document directories", async () => {
	const { directory, input } = await fixture({
		"README.mdx": nestedDocument,
		"nested/section.mdx": nestedSection,
		"component.tsx": greeting,
	})
	expect(parseMarkdown(await compileMarkdown(input))).toEqual(
		parseMarkdown(
			`## Nested\n\nHello **Ada** from ${path.join(directory, "nested")}\n`,
		),
	)
})

test("allows third-party plugins to consume arbitrary attributes with native module identity", async () => {
	const { input } = await fixture({
		"README.mdx": pluginImports,
	})
	const output = await compileMarkdown(input, {
		plugins: [
			{
				name: "custom-attributes",
				setup(build) {
					build.onResolve({ filter: /^virtual:/ }, (args) => ({
						path: args.path,
						namespace: "example",
					}))
					build.onLoad({ filter: /.*/, namespace: "example" }, (args) => {
						return {
							contents: pluginComponent.replace(
								"__LABEL__",
								JSON.stringify(args.with.label),
							),
							loader: "js",
						}
					})
				},
			},
		],
	})
	expect(parseMarkdown(output)).toEqual(
		parseMarkdown("identity passed\n\none\n\ntwo"),
	)
})

test("compiles changed local dependencies on the next call", async () => {
	const { directory, input } = await fixture({
		"README.mdx": changingComponent,
		"component.ts": beforeComponent,
	})
	expect(parseMarkdown(await compileMarkdown(input))).toEqual(
		parseMarkdown("before"),
	)
	await fs.writeFile(path.join(directory, "component.ts"), afterComponent)
	expect(parseMarkdown(await compileMarkdown(input))).toEqual(
		parseMarkdown("after"),
	)
})

test("write and check handle missing and stale output without modifying the source", async () => {
	const source = generatedDocument
	const { input, output } = await fixture({ "README.mdx": source })
	expect((await runGalley(input, { mode: "check" })).changed).toBe(true)
	await expect(fs.stat(output)).rejects.toMatchObject({ code: "ENOENT" })
	expect((await runGalley(input, { mode: "write" })).changed).toBe(true)
	expect((await runGalley(input, { mode: "check" })).changed).toBe(false)
	await fs.writeFile(output, "stale\n")
	expect((await runGalley(input, { mode: "check" })).changed).toBe(true)
	expect(await fs.readFile(output, "utf8")).toBe("stale\n")
	await runGalley(input, { mode: "write" })
	expect(parseMarkdown(await fs.readFile(output, "utf8"))).toEqual(
		parseMarkdown(source),
	)
	expect(await fs.readFile(input, "utf8")).toBe(source)
	await expect(
		runGalley(input, { mode: "write", output: input }),
	).rejects.toThrow()
	await fs.unlink(output)
	await fs.symlink(input, output)
	await expect(runGalley(input, { mode: "write" })).rejects.toThrow()
	expect(await fs.readFile(input, "utf8")).toBe(source)
})

// Six CLI processes share this budget, including startup on shared CI runners.
test("CLI writes, checks, reports drift, accepts explicit output, and shows help without evaluation", async () => {
	const { directory, input, output } = await fixture({
		"README.mdx": cliDocument,
	})
	const run = (...args: string[]) => runCli(directory, ...args)
	await run("write")
	expect(parseMarkdown(await fs.readFile(output, "utf8"))).toEqual(
		parseMarkdown("# CLI"),
	)
	await run("check")
	await fs.writeFile(output, "stale\n")
	await expect(run("check")).rejects.toMatchObject({
		code: 1,
	})
	expect(await fs.readFile(output, "utf8")).toBe("stale\n")
	await run("write", input, "custom.md")
	expect(
		parseMarkdown(await fs.readFile(path.join(directory, "custom.md"), "utf8")),
	).toEqual(parseMarkdown("# CLI"))
	await fs.writeFile(input, brokenDocument)
	expect((await run("--help")).stdout).toContain("galley")
	await expect(run("unknown")).rejects.toMatchObject({ code: 1 })
}, 20_000)

test.each([
	["unequal table rows", missingCells],
	["markup outside Html", unsupportedElement],
	["invalid code language", invalidLanguage],
])("rejects unsupported input: %s", async (_name, source) => {
	const { input } = await fixture({
		"README.mdx": source!,
		"example.ts": emptyModule,
	})
	await expect(compileMarkdown(input)).rejects.toThrow()
})
