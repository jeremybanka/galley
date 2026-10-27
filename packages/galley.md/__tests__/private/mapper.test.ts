// SPDX-License-Identifier: MPL-2.0
import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import {
	openProject,
	closeProject,
	transform,
} from "../../src/mapper/transform.ts"
import mappedImports from "#fixtures/editor/mapped-imports.mdx" with { type: "text" }
import customAttributes from "#fixtures/editor/custom-attributes.mdx" with { type: "text" }
import incompleteImport from "#fixtures/editor/incomplete-import.mdx" with { type: "text" }
import markdownLinks from "#fixtures/editor/markdown-links.mdx" with { type: "text" }
import { execute, root, fixture, diagnosticLocation } from "./editor-support.ts"

test("composes UTF-16 source maps and keeps attributed imports distinct from ordinary imports", async () => {
	const source = mappedImports
	await openProject({
		projectHandle: "unit",
		configFileName: "",
		compilerOptions: {},
	})
	const result = transform({
		projectHandle: "unit",
		fileName: "/tmp/README.mdx",
		content: source,
	})
	expect(
		result.diagnostics?.filter(
			({ messageText }) => !messageText.startsWith("Cannot read"),
		),
	).toEqual([])
	expect(result.text).toMatch(/import \{ value \} from (["'])\.\/example\.ts\1/)
	expect(result.text).toContain('import("galley.md").Component')
	expect(result.text).toContain("as unknown as string")
	for (const [v, vl, o, ol, kind] of result.mappings ?? []) {
		if (kind === 0)
			expect(result.text.slice(v, v + vl)).toBe(source.slice(o, o + ol))
	}
	closeProject({ projectHandle: "unit" })
})

test("reports unsupported attributes at their original spans and supports plugin import types", async () => {
	await openProject({
		projectHandle: "custom",
		configFileName: "",
		compilerOptions: {},
		options: {
			importTypes: [
				{
					type: "custom",
					valueType: "number",
					attributes: { variant: ["one", "two"] },
				},
			],
		},
	})
	const content = customAttributes
	const result = transform({
		projectHandle: "custom",
		fileName: "/tmp/README.mdx",
		content,
	})
	expect(result.text).toContain("as unknown as number")
	expect(result.diagnostics).toHaveLength(3)
	expect(
		content.slice(
			result.diagnostics![0]!.start,
			result.diagnostics![0]!.start + result.diagnostics![0]!.length,
		),
	).toMatch(/^(["'])bad\1$/)
	expect(result.diagnostics![2]!.messageText).toContain("language")
	closeProject({ projectHandle: "custom" })
})

test("incomplete MDX retains Galley's JSX runtime during parser recovery", async () => {
	await openProject({
		projectHandle: "incomplete",
		configFileName: "",
		compilerOptions: {},
	})
	const result = transform({
		projectHandle: "incomplete",
		fileName: "/tmp/README.mdx",
		content: incompleteImport,
	})
	expect(result.diagnostics?.length).toBeGreaterThan(0)
	expect(result.text).toContain("@jsxImportSource galley.md")
	closeProject({ projectHandle: "incomplete" })
})

test("Markdown links retain embedded expressions and source maps without breaking TypeScript projection", async () => {
	const source = markdownLinks
	const { directory, input } = await fixture(source)
	const tsc = path.join(root, "node_modules/typescript/bin/tsc")
	await expect(
		execute(process.execPath, [
			tsc,
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		]),
	).resolves.toMatchObject({ stdout: "" })
	await fs.writeFile(input, source.replace("toUpperCase", "toFixed"))
	await expect(
		execute(process.execPath, [
			tsc,
			"--runExternalCode",
			"--pretty",
			"false",
			"-p",
			directory,
		]),
	).rejects.toMatchObject({
		stdout: expect.stringContaining(
			diagnosticLocation(source.replace("toUpperCase", "toFixed"), "toFixed"),
		),
	})
}, 20_000)
