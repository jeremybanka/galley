// SPDX-License-Identifier: MPL-2.0
import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { previewMarkdown } from "../../src/compile.ts"
import { evaluatePreview } from "../../src/editor/preview.ts"
import previewErrors from "#fixtures/editor/preview-errors.mdx" with { type: "text" }
import savedDocument from "#fixtures/editor/saved.mdx" with { type: "text" }
import countedSection from "#fixtures/editor/counted-section.mdx" with { type: "text" }
import countedComponent from "#fixtures/editor/counted-component.ts" with { type: "text" }
import previewDocument from "#fixtures/editor/preview-document.mdx" with { type: "text" }
import codeImportDocument from "#fixtures/editor/code-import.mdx" with { type: "text" }
import timedOutDocument from "#fixtures/editor/timed-out.mdx" with { type: "text" }
import { fixture } from "./editor-support.ts"

test("previews use unsaved source, evaluate each component once, and retain nested document context", async () => {
	const { directory, input } = await fixture(savedDocument)
	await fs.mkdir(path.join(directory, "nested"))
	await fs.writeFile(path.join(directory, "nested/section.mdx"), countedSection)
	await fs.writeFile(path.join(directory, "component.ts"), countedComponent)
	const result = await previewMarkdown(input, {
		source: previewDocument,
	})
	expect(await fs.readFile(path.join(directory, "count"), "utf8")).toBe("1")
	expect(result.markdown).toBe(`From ${directory}/nested\n`)
	expect(result.components).toHaveLength(2)
	expect(
		result.components.every(({ markdown }) => markdown === result.markdown),
	).toBe(true)
	expect(result.dependencies).toContain(path.join(directory, "component.ts"))
	expect(await fs.readFile(input, "utf8")).toBe(savedDocument)
	const isolated = await evaluatePreview(input, codeImportDocument)
	expect(isolated.components[0]!.markdown).toContain("must not execute")
	await expect(
		evaluatePreview(input, timedOutDocument, undefined, 100),
	).rejects.toThrow("timed out")
}, 20_000)

test("component and expression failures report source ranges without losing healthy previews", async () => {
	const { input } = await fixture(previewErrors)
	const result = await evaluatePreview(input, previewErrors)
	expect(result.errors.map((item) => item.message)).toEqual(
		expect.arrayContaining([
			"component failed",
			"expression failed",
			"inline failed",
			expect.stringContaining("Missing"),
		]),
	)
	expect(result.errors).toHaveLength(5)
	expect(result.components).toHaveLength(2)
	expect(result.components[0]!.markdown).toContain("before")
	expect(result.components[1]!.markdown).toContain("after")
	for (const error of result.errors) {
		expect(error.file).toBe(input)
		expect(previewErrors.slice(error.start, error.end)).toMatch(
			/Broken|throw|Missing/,
		)
	}
	await expect(previewMarkdown(input)).rejects.toThrow()
}, 20_000)
