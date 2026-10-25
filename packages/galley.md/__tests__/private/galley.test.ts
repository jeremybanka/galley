import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, test } from "vite-plus/test"

import { compileMarkdown, Markdown, previewMarkdown } from "../../src/index.ts"

import comments from "#fixtures/compiler/comments.mdx" with { type: "text" }
import commentDelimiters from "#fixtures/compiler/comment-delimiters.mdx" with { type: "text" }
import htmlBranding from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
import htmlTables from "#fixtures/compiler/html-tables.mdx" with { type: "text" }
import htmlComponents from "#fixtures/compiler/html-components.mdx" with { type: "text" }
import htmlBadge from "#fixtures/compiler/badge.tsx" with { type: "text" }
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
import missingImport from "#fixtures/compiler/invalid/missing-import.mdx" with { type: "text" }
import unknownAttribute from "#fixtures/compiler/invalid/unknown-attribute.mdx" with { type: "text" }
import invalidLanguage from "#fixtures/compiler/invalid/language.mdx" with { type: "text" }
import unsupportedElement from "#fixtures/compiler/invalid/element.mdx" with { type: "text" }
import emptyModule from "#fixtures/compiler/empty-module.ts" with { type: "text" }

const directories: string[] = []

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
})
