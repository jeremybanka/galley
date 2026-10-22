import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterEach, describe, expect, test } from "vite-plus/test"

import {
	compileMarkdown,
	Markdown,
	previewMarkdown,
	runGalley,
} from "../src/index.ts"

import comments from "#fixtures/compiler/comments.mdx" with { type: "text" }
import commentDelimiters from "#fixtures/compiler/comment-delimiters.mdx" with { type: "text" }
import htmlBranding from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
import htmlTables from "#fixtures/compiler/html-tables.mdx" with { type: "text" }
import htmlComponents from "#fixtures/compiler/html-components.mdx" with { type: "text" }
import htmlBadge from "#fixtures/compiler/badge.tsx" with { type: "text" }
import plainMarkdown from "#fixtures/compiler/plain.md" with { type: "text" }
import markdownImports from "#fixtures/compiler/markdown-imports.mdx" with { type: "text" }
import markdownStructure from "#fixtures/compiler/markdown-structure.mdx" with { type: "text" }
import alignedTable from "#fixtures/compiler/aligned-table.mdx" with { type: "text" }
import alignedTableExpected from "#fixtures/compiler/aligned-table.expected.md" with { type: "text" }
import wrappedTables from "#fixtures/compiler/wrapped-tables.mdx" with { type: "text" }
import wrappedTablesExpected from "#fixtures/compiler/wrapped-tables.expected.md" with { type: "text" }
import asyncTable from "#fixtures/compiler/async-table.mdx" with { type: "text" }
import tableComponents from "#fixtures/compiler/table.tsx" with { type: "text" }
import asyncTableExpected from "#fixtures/compiler/async-table.expected.md" with { type: "text" }
import emptyTable from "#fixtures/compiler/table-errors/empty-table.mdx" with { type: "text" }
import orphanRow from "#fixtures/compiler/table-errors/orphan-row.mdx" with { type: "text" }
import orphanHeaderCell from "#fixtures/compiler/table-errors/orphan-header-cell.mdx" with { type: "text" }
import orphanBodyCell from "#fixtures/compiler/table-errors/orphan-body-cell.mdx" with { type: "text" }
import nestedHeaderSection from "#fixtures/compiler/table-errors/nested-header-section.mdx" with { type: "text" }
import missingHeader from "#fixtures/compiler/table-errors/missing-header.mdx" with { type: "text" }
import emptyHeaderSection from "#fixtures/compiler/table-errors/empty-header-section.mdx" with { type: "text" }
import multipleSectionHeaders from "#fixtures/compiler/table-errors/multiple-section-headers.mdx" with { type: "text" }
import multipleHeaders from "#fixtures/compiler/table-errors/multiple-headers.mdx" with { type: "text" }
import headerInBody from "#fixtures/compiler/table-errors/header-in-body.mdx" with { type: "text" }
import mixedCells from "#fixtures/compiler/table-errors/mixed-cells.mdx" with { type: "text" }
import missingCells from "#fixtures/compiler/table-errors/missing-cells.mdx" with { type: "text" }
import extraCells from "#fixtures/compiler/table-errors/extra-cells.mdx" with { type: "text" }
import emptyRow from "#fixtures/compiler/table-errors/empty-row.mdx" with { type: "text" }
import textInRow from "#fixtures/compiler/table-errors/text-in-row.mdx" with { type: "text" }
import textInTable from "#fixtures/compiler/table-errors/text-in-table.mdx" with { type: "text" }
import paragraphInTable from "#fixtures/compiler/table-errors/paragraph-in-table.mdx" with { type: "text" }
import tableCaption from "#fixtures/compiler/table-errors/caption.mdx" with { type: "text" }
import tableFooter from "#fixtures/compiler/table-errors/footer.mdx" with { type: "text" }
import tableColumnGroup from "#fixtures/compiler/table-errors/column-group.mdx" with { type: "text" }
import tableColumn from "#fixtures/compiler/table-errors/column.mdx" with { type: "text" }
import tableClass from "#fixtures/compiler/table-errors/class.mdx" with { type: "text" }
import tableStyle from "#fixtures/compiler/table-errors/style.mdx" with { type: "text" }
import tableColumnSpan from "#fixtures/compiler/table-errors/column-span.mdx" with { type: "text" }
import tableRowSpan from "#fixtures/compiler/table-errors/row-span.mdx" with { type: "text" }
import rowAlignment from "#fixtures/compiler/table-errors/row-alignment.mdx" with { type: "text" }
import invalidAlignment from "#fixtures/compiler/table-errors/invalid-alignment.mdx" with { type: "text" }
import nullAlignment from "#fixtures/compiler/table-errors/null-alignment.mdx" with { type: "text" }
import bodyAlignment from "#fixtures/compiler/table-errors/body-alignment.mdx" with { type: "text" }
import nestedTable from "#fixtures/compiler/table-errors/nested-table.mdx" with { type: "text" }
import hardBreakInCell from "#fixtures/compiler/table-errors/hard-break.mdx" with { type: "text" }
import paragraphsInCell from "#fixtures/compiler/table-errors/paragraphs.mdx" with { type: "text" }
import listInCell from "#fixtures/compiler/table-errors/list.mdx" with { type: "text" }
import codeSource from "#fixtures/compiler/code-source.ts" with { type: "text" }
import codeImports from "#fixtures/compiler/code-imports.mdx" with { type: "text" }
import runtimeSource from "#fixtures/compiler/runtime-source.ts" with { type: "text" }
import rawNote from "#fixtures/compiler/note.txt" with { type: "text" }
import mixedImports from "#fixtures/compiler/mixed-imports.mdx" with { type: "text" }
import nestedDocument from "#fixtures/compiler/nested-document.mdx" with { type: "text" }
import nestedSection from "#fixtures/compiler/nested-section.mdx" with { type: "text" }
import greeting from "#fixtures/compiler/greeting.tsx" with { type: "text" }
import pluginImports from "#fixtures/compiler/plugin-imports.mdx" with { type: "text" }
import pluginComponent from "#fixtures/compiler/plugin-component.ts" with { type: "text" }
import changingComponent from "#fixtures/compiler/changing-component.mdx" with { type: "text" }
import beforeComponent from "#fixtures/compiler/before.ts" with { type: "text" }
import afterComponent from "#fixtures/compiler/after.ts" with { type: "text" }
import missingImport from "#fixtures/compiler/invalid/missing-import.mdx" with { type: "text" }
import unknownAttribute from "#fixtures/compiler/invalid/unknown-attribute.mdx" with { type: "text" }
import invalidLanguage from "#fixtures/compiler/invalid/language.mdx" with { type: "text" }
import unsupportedElement from "#fixtures/compiler/invalid/element.mdx" with { type: "text" }
import emptyModule from "#fixtures/compiler/empty-module.ts" with { type: "text" }
import generatedDocument from "#fixtures/compiler/generated.mdx" with { type: "text" }
import cliDocument from "#fixtures/compiler/cli.mdx" with { type: "text" }
import brokenDocument from "#fixtures/compiler/invalid/broken.mdx" with { type: "text" }

const execute = promisify(execFile)
const directories: string[] = []
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	)
})

async function fixture(files: Record<string, string>) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "galley-"))
	directories.push(directory)
	for (const [name, contents] of Object.entries(files)) {
		await fs.mkdir(path.dirname(path.join(directory, name)), {
			recursive: true,
		})
		await fs.writeFile(path.join(directory, name), contents)
	}
	return {
		directory,
		input: path.join(directory, "README.mdx"),
		output: path.join(directory, "README.md"),
	}
}

function withoutPositions(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, child: unknown) =>
			key === "position" ? undefined : child,
		),
	)
}

describe("galley documents", () => {
	test("emits Comment children in blocks, prose, Html, and previews", async () => {
		const { input } = await fixture({
			"README.mdx": comments,
		})
		const result = await previewMarkdown(input)
		expect(result.markdown).toBe(
			"<!-- Generated from README.mdx. -->\n\nBefore <!-- inline note --> after.\n\n<!-- First line\nSecond line -->\n\n<div><!-- Inside **HTML** --></div>\n",
		)
		const comment = result.components.find(
			(component) =>
				component.markdown === "<!-- Generated from README.mdx. -->\n",
		)
		expect(comment).toBeDefined()
		expect(await compileMarkdown(input)).toBe(result.markdown)
	})

	test.each(["<!-- nested", "early --> exit", "early --!> exit"])(
		"rejects comment delimiters in children: %s",
		async (children) => {
			const { input } = await fixture({
				"README.mdx": commentDelimiters.replace(
					"COMMENT_TEXT",
					JSON.stringify(children),
				),
			})
			await expect(compileMarkdown(input)).rejects.toThrow(
				"Comment children cannot contain HTML comment delimiters.",
			)
		},
	)

	test("preserves README markup and attributes inside Html and escapes text", async () => {
		const { input } = await fixture({
			"README.mdx": htmlBranding,
		})
		const output = await compileMarkdown(input)
		expect(output).toContain('<div align="center">')
		expect(output).toContain(
			'<img src="logo.png" alt="Logo" width="160" height="160">',
		)
		expect(output).toContain('<h1 align="center"><code>atom.io</code></h1>')
		expect(output).toContain(
			'aria-label="Read docs" title="Say &#x22;hello&#x22;">Read <i>the docs</i></a>',
		)
		expect(output).toContain('href="https://example.com/?a=1&#x26;b=2"')
		expect(output).toContain(
			'<p>&#x3C;script>alert("hello")&#x3C;/script> &#x26; text</p>',
		)
		expect(output).toContain(
			'<input disabled aria-hidden="false" data-label="example">',
		)
		expect(output).toContain(
			'<label for="name" class="label wide" style="color: red">Name</label>',
		)
		expect(output).toContain("\n\nMarkdown **still works**.\n")
		expect(output).not.toContain("<Html>")
	})

	test("distinguishes markup tables inside Html from native Markdown tables", async () => {
		const { input } = await fixture({
			"README.mdx": htmlTables,
		})
		const output = await compileMarkdown(input)
		const nodes = Markdown({ children: output }).children
		expect(nodes.map((node) => node.type)).toEqual(["table", "html"])
		expect(output).toContain(
			'<table align="center"><thead><tr><th colspan="2">Markup</th></tr></thead><tbody><tr><td>HTML</td><td><strong>two</strong></td></tr></tbody></table>',
		)
	})

	test("composes Html with async components, Markdown nodes, and editor previews", async () => {
		const { directory, input } = await fixture({
			"README.mdx": htmlComponents,
			"badge.tsx": htmlBadge,
		})
		const result = await previewMarkdown(input)
		expect(result.markdown).toContain(
			`<div><span data-count="1" title="${directory}">A &#x26; B</span> 1 &#x26; 2<i>nested</i></div>`,
		)
		expect(result.markdown).toContain("<table>")
		expect(result.markdown).toContain("<td><strong>bold</strong></td>")
		const badge = result.components.find((component) =>
			component.markdown.startsWith("<span"),
		)
		expect(badge?.markdown).toBe(
			`<span data-count="1" title="${directory}">A &#x26; B</span>`,
		)
		expect(
			result.components.some(
				(component) => component.markdown.trim() === result.markdown.trim(),
			),
		).toBe(true)
		expect(await compileMarkdown(input)).toBe(result.markdown)
	})

	test("keeps inline expression whitespace and treats Markdown imports as data", async () => {
		const markdown = plainMarkdown
		const { input } = await fixture({
			"plain.md": markdown,
			"README.mdx": markdownImports,
		})
		const output = await compileMarkdown(input)
		expect(output).toContain("a\nb\n")
		expect(output).toContain("<details>\n\nA **plain** document with {braces}.")
		const code = Markdown({ children: output }).children.find(
			(node) => node.type === "code",
		)
		expect(code?.value).toBe(markdown)
	})
	test("preserves Markdown structure including references, footnotes, tasks, and tables", async () => {
		const source = markdownStructure
		const { input } = await fixture({ "README.mdx": source })
		expect(
			withoutPositions(Markdown({ children: await compileMarkdown(input) })),
		).toEqual(withoutPositions(Markdown({ children: source })))
	})

	test("compiles native tables with column alignment, inline Markdown, and escaped cells", async () => {
		const { input } = await fixture({
			"README.mdx": alignedTable,
		})
		const output = await compileMarkdown(input)
		expect(withoutPositions(Markdown({ children: output }))).toEqual(
			withoutPositions(
				Markdown({
					children: alignedTableExpected,
				}),
			),
		)
		expect(output).not.toContain("<table>")
	})

	test("supports direct rows, header-only tables, and soft wrapping in cells", async () => {
		const { input } = await fixture({
			"README.mdx": wrappedTables,
		})
		expect(
			withoutPositions(Markdown({ children: await compileMarkdown(input) })),
		).toEqual(
			withoutPositions(
				Markdown({
					children: wrappedTablesExpected,
				}),
			),
		)
	})

	test("resolves async table components and fragments once and previews partial rows", async () => {
		const { input } = await fixture({
			"README.mdx": asyncTable,
			"table.tsx": tableComponents,
		})
		const result = await previewMarkdown(input)
		expect(result.markdown).toBe(await compileMarkdown(input))
		expect(withoutPositions(Markdown({ children: result.markdown }))).toEqual(
			withoutPositions(
				Markdown({
					children: asyncTableExpected,
				}),
			),
		)
		expect(result.components).toHaveLength(3)
		expect(result.components[1]?.markdown).toContain("a\\|b")
	})

	test.each([
		[emptyTable, "exactly one header row"],
		[orphanRow, "<tr> must be inside"],
		[orphanHeaderCell, "<th> must be inside <tr>"],
		[orphanBodyCell, "<td> must be inside <tr>"],
		[nestedHeaderSection, "<thead> must be inside <table>"],
		[missingHeader, "exactly one header row"],
		[emptyHeaderSection, "<thead> must contain exactly one"],
		[multipleSectionHeaders, "<thead> must contain exactly one"],
		[multipleHeaders, "exactly one header row"],
		[headerInBody, "<tbody> must contain only body rows"],
		[mixedCells, "cannot mix <th> and <td>"],
		[missingCells, "Table row 2 has 1 cells; expected 2"],
		[extraCells, "Table row 2 has 2 cells; expected 1"],
		[emptyRow, "<tr> must contain one or more"],
		[textInRow, "<tr> must contain one or more"],
		[textInTable, "<table> must contain table rows"],
		[paragraphInTable, "Unsupported element <p> inside <table>"],
		[tableCaption, "Unsupported table element <caption>"],
		[tableFooter, "Unsupported table element <tfoot>"],
		[tableColumnGroup, "Unsupported table element <colgroup>"],
		[tableColumn, "Unsupported table element <col>"],
		[tableClass, 'Unsupported attribute "className" on <table>'],
		[tableStyle, 'Unsupported attribute "style" on <table>'],
		[tableColumnSpan, 'Unsupported attribute "colSpan" on <th>'],
		[tableRowSpan, 'Unsupported attribute "rowSpan" on <th>'],
		[rowAlignment, 'Unsupported attribute "align" on <tr>'],
		[invalidAlignment, "Invalid <th> alignment"],
		[nullAlignment, "Invalid <th> alignment"],
		[bodyAlignment, 'Unsupported attribute "align" on <td>'],
		[nestedTable, "Nested tables cannot be represented"],
		[hardBreakInCell, "Table cells support inline content only; found break"],
		[
			paragraphsInCell,
			"Table cells support inline content only; found paragraph",
		],
		[listInCell, "Table cells support inline content only; found list"],
	])("rejects unsupported table markup: %s", async (source, error) => {
		const { input } = await fixture({ "README.mdx": source })
		await expect(compileMarkdown(input)).rejects.toThrow(error)
	})

	test("imports one source as distinct code components, reuses identical attributes, and never executes it", async () => {
		const source = codeSource
		const { input } = await fixture({
			"example.ts": source,
			"README.mdx": codeImports,
		})
		const output = await compileMarkdown(input)
		expect(output).toContain("identity passed")
		expect(output).not.toContain("identity failed")
		expect(output).toContain(`\`\`\`\`ts\n${source}\n\`\`\`\``)
		expect(output).toContain(`\`\`\`\`text\n${source}\n\`\`\`\``)
		expect(
			Markdown({ children: output })
				.children.filter((node) => node.type === "code")
				.map((node) => node.value),
		).toEqual([source, source, source])
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
		expect(await compileMarkdown(input)).toBe(
			`## Nested\n\nHello **Ada** from ${directory}/nested\n`,
		)
	})

	test("allows third-party plugins to consume arbitrary attributes with native module identity", async () => {
		const { input } = await fixture({
			"README.mdx": pluginImports,
		})
		const loads: string[] = []
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
							loads.push(String(args.with.label))
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
		expect(loads.sort()).toEqual(["one", "two"])
		expect(output).toBe("identity passed\n\none\n\ntwo\n")
	})

	test("compiles changed local dependencies on the next call", async () => {
		const { directory, input } = await fixture({
			"README.mdx": changingComponent,
			"component.ts": beforeComponent,
		})
		expect(await compileMarkdown(input)).toBe("before\n")
		await fs.writeFile(path.join(directory, "component.ts"), afterComponent)
		expect(await compileMarkdown(input)).toBe("after\n")
	})

	test.each([
		[missingImport, "missing.ts"],
		[unknownAttribute, "Unknown code import attribute: language"],
		[invalidLanguage, "Code languages"],
		[unsupportedElement, "Unsupported Markdown element <div>"],
	])("reports invalid input: %s", async (document, error) => {
		const { input } = await fixture({
			"README.mdx": document,
			"example.ts": emptyModule,
		})
		await expect(compileMarkdown(input)).rejects.toThrow(error)
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
		expect(await fs.readFile(output, "utf8")).toBe(source)
		expect(await fs.readFile(input, "utf8")).toBe(source)
		await expect(
			runGalley(input, { mode: "write", output: input }),
		).rejects.toThrow("must differ")
		await fs.unlink(output)
		await fs.symlink(input, output)
		await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
			"must differ",
		)
		expect(await fs.readFile(input, "utf8")).toBe(source)
	})

	test("CLI writes, checks, reports drift, accepts explicit output, and shows help without evaluation", async () => {
		const { directory, input, output } = await fixture({
			"README.mdx": cliDocument,
		})
		const run = (...args: string[]) =>
			execute(process.execPath, [cli, ...args], { cwd: directory })
		expect(await run("write")).toMatchObject({
			stdout: expect.stringContaining("Updated README.md"),
		})
		await run("check")
		await fs.writeFile(output, "stale\n")
		await expect(run("check")).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining("out of date"),
		})
		expect(await fs.readFile(output, "utf8")).toBe("stale\n")
		await run("write", input, "custom.md")
		expect(await fs.readFile(path.join(directory, "custom.md"), "utf8")).toBe(
			"# CLI\n",
		)
		await fs.writeFile(input, brokenDocument)
		expect((await run("--help")).stdout).toContain("galley")
		await expect(run("unknown")).rejects.toMatchObject({ code: 1 })
	})
})
