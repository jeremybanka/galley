// SPDX-License-Identifier: MPL-2.0
import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { previewMarkdown } from "../../src/compile.ts"
import { createFromBuffer } from "@dprint/formatter"
import { parseDocument } from "../../src/editor/document.ts"
import layoutDocument from "#fixtures/editor/layout.mdx" with { type: "text" }
import layoutComponent from "#fixtures/editor/layout.tsx" with { type: "text" }
import documentProps from "#fixtures/editor/document-props.mdx" with { type: "text" }
import typedFormatting from "#fixtures/editor/typed-formatting.mdx" with { type: "text" }
import typedDocument from "#fixtures/editor/typed.mdx" with { type: "text" }
import typedInvalid from "#fixtures/editor/typed-invalid.mdx" with { type: "text" }
import checkedComments from "#fixtures/editor/checked-comments.mdx" with { type: "text" }
import checkedImports from "#fixtures/editor/checked-imports.mdx" with { type: "text" }
import invalidUsages from "#fixtures/editor/invalid-usages.mdx" with { type: "text" }
import checkedTable from "#fixtures/editor/checked-table.mdx" with { type: "text" }
import checkedTableComponent from "#fixtures/editor/table.tsx" with { type: "text" }
import tableUsage from "#fixtures/editor/table-usage.mdx" with { type: "text" }
import htmlTableUsage from "#fixtures/editor/html-table-usage.mdx" with { type: "text" }
import htmlTableComponent from "#fixtures/editor/table-html.tsx" with { type: "text" }
import checkedHtml from "#fixtures/editor/checked-html.mdx" with { type: "text" }
import { execute, root, fixture, diagnosticLocation } from "./editor-support.ts"

test("TypeScript 7.1 checks real attributed imports and maps errors back to MDX", async () => {
	const { directory, input } = await fixture(checkedImports)
	const tsc = path.join(root, "node_modules/typescript/bin/tsc")
	const check = () =>
		execute(process.execPath, [
			tsc,
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		])
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	await fs.appendFile(input, `\n${invalidUsages}`)
	await expect(check()).rejects.toMatchObject({
		stdout: expect.stringContaining(
			diagnosticLocation(`${checkedImports}\n${invalidUsages}`, "<Text", 1),
		),
	})
	try {
		await check()
	} catch (error) {
		const output = (error as { stdout: string }).stdout
		expect(output).toContain("toFixed")
		expect(output).toContain(
			diagnosticLocation(`${checkedImports}\n${invalidUsages}`, "invalid="),
		)
		expect(output).not.toContain("no default export")
	}
}, 20_000)

test.each([undefined, "react"])(
	"MDX selects Galley's JSX runtime when the project uses %s",
	async (jsxImportSource) => {
		const { directory, input } = await fixture(checkedImports)
		const configPath = path.join(directory, "tsconfig.json")
		const config = JSON.parse(await fs.readFile(configPath, "utf8")) as {
			compilerOptions: { jsxImportSource?: string }
		}
		if (jsxImportSource === undefined)
			delete config.compilerOptions.jsxImportSource
		else config.compilerOptions.jsxImportSource = jsxImportSource
		await fs.writeFile(configPath, JSON.stringify(config))
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
		await fs.appendFile(input, `\n${invalidUsages}`)
		await expect(check()).rejects.toMatchObject({
			stdout: expect.stringContaining(
				diagnosticLocation(`${checkedImports}\n${invalidUsages}`, "<Text", 1),
			),
		})
	},
	20_000,
)

test("TypeScript checks native tables and HTML table attributes in MDX and TSX", async () => {
	const { directory, input } = await fixture(checkedTable)
	const tsc = path.join(root, "node_modules/typescript/bin/tsc")
	const check = () =>
		execute(process.execPath, [
			tsc,
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		])
	await fs.writeFile(path.join(directory, "table.tsx"), checkedTableComponent)
	await fs.appendFile(input, `\n${tableUsage}`)
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	await fs.appendFile(input, `\n${htmlTableUsage}`)
	await fs.appendFile(
		path.join(directory, "table.tsx"),
		`\n${htmlTableComponent}`,
	)
	await expect(check()).resolves.toMatchObject({ stdout: "" })
}, 20_000)

test("TypeScript checks Html boundaries with markup tables and custom elements", async () => {
	const { directory } = await fixture(checkedHtml)
	await expect(
		execute(process.execPath, [
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		]),
	).resolves.toMatchObject({ stdout: "" })
}, 20_000)

test("TypeScript checks Comment and Html with markup tables and custom elements", async () => {
	const { directory } = await fixture(checkedComments)
	await expect(
		execute(process.execPath, [
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		]),
	).resolves.toMatchObject({ stdout: "" })
}, 20_000)

test("typed MDX compiles, typechecks, and maps TypeScript and strict-prop errors", async () => {
	const { directory, input } = await fixture(typedDocument)
	const check = () =>
		execute(process.execPath, [
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--runExternalCode",
			"--declaration",
			"--pretty",
			"false",
			"-p",
			directory,
		])
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	const preview = await previewMarkdown(input)
	expect(preview.markdown).toContain('width="160"')
	expect(preview.markdown).toContain("<strong>160px</strong>")
	expect(preview.markdown).toContain("export const value")
	await fs.appendFile(input, `\n${typedInvalid}`)
	await expect(check()).rejects.toMatchObject({
		stdout: expect.stringContaining("README.mdx"),
	})
	try {
		await check()
	} catch (error) {
		const output = (error as { stdout: string }).stdout
		for (const fragment of [
			"number",
			"unknownProperty",
			"diagonal",
			"invalid",
			"missing",
		])
			expect(output).toContain(fragment)
		expect(output).not.toContain("virtual code")
	}
}, 20_000)

test("the standalone MDX WASM formats typed code without changing evaluation or types", async () => {
	const bytes = await fs.readFile(
		new URL("../../../dprint-plugin-mdx/plugin.wasm", import.meta.url),
	)
	const formatter = createFromBuffer(bytes)
	formatter.setConfig({ lineWidth: 80 }, {})
	const format = (source: string) =>
		formatter.formatText({ filePath: "README.mdx", fileText: source })
	const formatted = format(typedFormatting)
	expect(formatted).not.toBe(typedFormatting)
	expect(formatted).toContain("export type Size = { width: number }")
	expect(formatted).toContain("as string")
	expect(formatted).toContain("satisfies Size")
	expect(formatted).not.toContain('width="{160}"')
	expect(format(formatted)).toBe(formatted)
	expect(() => parseDocument(formatted)).not.toThrow()
	const { directory, input } = await fixture(typedFormatting)
	const original = await previewMarkdown(input)
	await fs.writeFile(input, formatted)
	expect((await previewMarkdown(input)).markdown).toBe(original.markdown)
	await expect(
		execute(process.execPath, [
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		]),
	).resolves.toMatchObject({ stdout: "" })
}, 20_000)

test("typed projection preserves exported document props and re-exported layouts", async () => {
	const { directory, input } = await fixture(layoutDocument)
	await fs.writeFile(path.join(directory, "layout.tsx"), layoutComponent)
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
	expect((await previewMarkdown(input)).markdown).toContain(
		"<blockquote><h1>Typed layout</h1></blockquote>",
	)
	await fs.writeFile(input, documentProps)
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	await fs.writeFile(
		input,
		documentProps.replace("props.title", "props.missing"),
	)
	await expect(check()).rejects.toMatchObject({
		stdout: expect.stringContaining(
			diagnosticLocation(
				documentProps.replace("props.title", "props.missing"),
				"missing",
			),
		),
	})
}, 20_000)
