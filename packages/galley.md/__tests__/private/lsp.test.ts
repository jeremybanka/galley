// SPDX-License-Identifier: MPL-2.0
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { expect, test } from "vite-plus/test"
import { previewMarkdown } from "../../src/compile.ts"
import { evaluatePreview } from "../../src/editor/preview.ts"
import recoveryDocument from "#fixtures/editor/recovery.mdx" with { type: "text" }
import typedDocument from "#fixtures/editor/typed.mdx" with { type: "text" }
import typedInvalid from "#fixtures/editor/typed-invalid.mdx" with { type: "text" }
import codeImportDocument from "#fixtures/editor/code-import.mdx" with { type: "text" }
import languageServerDocument from "#fixtures/editor/language-server.mdx" with { type: "text" }
import loggingSource from "#fixtures/editor/logging-source.ts" with { type: "text" }
import incompleteImport from "#fixtures/editor/incomplete-import.mdx" with { type: "text" }
import readmeDocument from "#fixtures/editor/readme.mdx" with { type: "text" }
import { fixture, positionOf, lsp } from "./editor-support.ts"

test("LSP avoids duplicate document registrations for dynamic-capable clients", async () => {
	const { directory, input } = await fixture(codeImportDocument)
	await fs.unlink(path.join(directory, "tsconfig.json"))
	const registrations: { method: string }[] = []
	const connection = await lsp(directory, false, registrations)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: {
			uri,
			languageId: "galley",
			version: 1,
			text: codeImportDocument,
		},
	})
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position: positionOf(codeImportDocument, "Code"),
	})
	expect(JSON.stringify(hover)).toContain("Code component")
	const diagnostics = await connection.sendRequest<{ items: unknown[] }>(
		"textDocument/diagnostic",
		{ textDocument: { uri } },
	)
	expect(diagnostics.items).toEqual([])
	expect(
		registrations.filter(({ method }) => method.startsWith("textDocument/")),
	).toEqual([])
	expect(registrations).toContainEqual(
		expect.objectContaining({ method: "workspace/didChangeConfiguration" }),
	)
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("LSP serves attribute completion, definitions, real TypeScript hover, and isolated versioned previews", async () => {
	const source = languageServerDocument
	const { directory, input } = await fixture(source)
	await fs.writeFile(path.join(directory, "example.ts"), loggingSource)
	const connection = await lsp(directory, true)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: { uri, languageId: "galley", version: 1, text: source },
	})
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position: positionOf(source, "{value}", 2),
	})
	expect(JSON.stringify(hover)).toContain("123")
	const locations = await connection.sendRequest<{ uri: string }[]>(
		"textDocument/definition",
		{
			textDocument: { uri },
			position: positionOf(
				source,
				"import Code",
				source.slice(source.indexOf("import Code")).indexOf("./example.ts") + 2,
			),
		},
	)
	expect(locations[0]?.uri).toBe(
		pathToFileURL(path.join(directory, "example.ts")).href,
	)
	const usage = await connection.sendRequest<{ uri: string }[]>(
		"textDocument/definition",
		{ textDocument: { uri }, position: positionOf(source, "<Code", 2) },
	)
	expect(usage[0]?.uri).toBe(locations[0]?.uri)
	const rename = await connection.sendRequest("textDocument/rename", {
		textDocument: { uri },
		position: positionOf(source, "<Code", 2),
		newName: "Example",
	})
	expect(JSON.stringify(rename)).toContain('"newText":"Example"')
	const result = await connection.sendRequest<{
		version: number
		components: { markdown: string }[]
	}>("galley/preview", { uri })
	expect(result.version).toBe(1)
	expect(result.components[0]?.markdown).toContain("export const value = 123")
	await connection.sendNotification("textDocument/didChange", {
		textDocument: { uri, version: 2 },
		contentChanges: [{ text: incompleteImport }],
	})
	const completion = await connection.sendRequest<{
		items: { label: string }[]
	}>("textDocument/completion", {
		textDocument: { uri },
		position: positionOf(incompleteImport, "co", 2),
	})
	expect(completion.items.map(({ label }) => label)).toContain("code")
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("standalone LSP does not evaluate previews without explicit trust", async () => {
	const { directory, input } = await fixture(readmeDocument)
	const connection = await lsp(directory)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: {
			uri,
			languageId: "galley",
			version: 1,
			text: readmeDocument,
		},
	})
	await expect(
		connection.sendRequest("galley/preview", { uri }),
	).rejects.toThrow("trusted")
}, 20_000)

test("inferred projects receive the TypeScript mapper without a tsconfig", async () => {
	const source = codeImportDocument
	const { directory, input } = await fixture(source)
	await fs.unlink(path.join(directory, "tsconfig.json"))
	const connection = await lsp(directory)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: { uri, languageId: "galley", version: 1, text: source },
	})
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position: positionOf(source, "<Code", 2),
	})
	expect(JSON.stringify(hover)).toContain("Component")
	const diagnostics = await connection.sendRequest<{ items: unknown[] }>(
		"textDocument/diagnostic",
		{ textDocument: { uri } },
	)
	expect(diagnostics.items).toEqual([])
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("typed MDX editor hover, rename, and diagnostics retain authored positions", async () => {
	const { directory, input } = await fixture(typedDocument)
	const connection = await lsp(directory)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: {
			uri,
			languageId: "galley",
			version: 1,
			text: typedDocument,
		},
	})
	const offset = typedDocument.indexOf("size.width")
	const before = typedDocument.slice(0, offset)
	const position = {
		line: before.split("\n").length - 1,
		character: before.length - before.lastIndexOf("\n") - 1,
	}
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position,
	})
	expect(JSON.stringify(hover)).toContain("Size")
	const rename = await connection.sendRequest("textDocument/rename", {
		textDocument: { uri },
		position,
		newName: "dimensions",
	})
	expect(JSON.stringify(rename)).toContain('"newText":"dimensions"')
	await connection.sendNotification("textDocument/didChange", {
		textDocument: { uri, version: 2 },
		contentChanges: [{ text: `${typedDocument}\n${typedInvalid}` }],
	})
	const diagnostics = await connection.sendRequest<{
		items: { message: string; range: { start: { line: number } } }[]
	}>("textDocument/diagnostic", { textDocument: { uri } })
	expect(
		diagnostics.items.some((item) => item.message.includes("unknownProperty")),
	).toBe(true)
	expect(
		diagnostics.items.every(
			(item) => item.range.start.line >= typedDocument.split("\n").length - 1,
		),
	).toBe(true)
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("syntax errors retain checking and previews before and after the broken region", async () => {
	const { directory, input } = await fixture(recoveryDocument)
	const connection = await lsp(directory, true)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: {
			uri,
			languageId: "galley",
			version: 1,
			text: recoveryDocument,
		},
	})
	for (const name of ["{before}", "{after.toFixed()}"]) {
		const prefix = recoveryDocument.slice(0, recoveryDocument.indexOf(name) + 2)
		const position = {
			line: prefix.split("\n").length - 1,
			character: prefix.length - prefix.lastIndexOf("\n") - 1,
		}
		const hover = await connection.sendRequest("textDocument/hover", {
			textDocument: { uri },
			position,
		})
		expect(hover).not.toBeNull()
	}
	const diagnostics = await connection.sendRequest<{ items: unknown[] }>(
		"textDocument/diagnostic",
		{ textDocument: { uri } },
	)
	expect(diagnostics.items.length).toBeGreaterThan(0)
	const preview = await connection.sendRequest<
		Awaited<ReturnType<typeof evaluatePreview>>
	>("galley/preview", { uri })
	expect(preview.errors).toHaveLength(1)
	expect(preview.components.map((item) => item.markdown)).toContain("before\n")
	expect(preview.components.map((item) => item.markdown)).toContain("3\n")
	expect(preview.markdown).toContain("fenced code must not execute")
	await expect(previewMarkdown(input)).rejects.toThrow()
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)
