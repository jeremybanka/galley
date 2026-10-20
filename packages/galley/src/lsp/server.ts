#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-jsonrpc/node"
import { TextDocument } from "vscode-languageserver-textdocument"
import type {
	DidChangeTextDocumentParams,
	DidCloseTextDocumentParams,
	DidOpenTextDocumentParams,
	InitializeParams,
	InitializeResult,
	Location,
	LocationLink,
	TextDocumentPositionParams,
} from "vscode-languageserver"
import { evaluatePreview } from "../editor/preview.ts"
import { runtimeEntry } from "../editor/paths.ts"
import {
	attributeCompletions,
	attributeHover,
	importDefinition,
} from "./attributes.ts"

const require = createRequire(import.meta.url)
const typescriptRoot = path.dirname(require.resolve("typescript/package.json"))
const child = spawn(
	process.execPath,
	[path.join(typescriptRoot, "bin/tsc"), "--lsp", "--stdio"],
	{ stdio: ["pipe", "pipe", "pipe"] },
)
const upstream = createMessageConnection(
	new StreamMessageReader(child.stdout),
	new StreamMessageWriter(child.stdin),
)
const editor = createMessageConnection(
	new StreamMessageReader(process.stdin),
	new StreamMessageWriter(process.stdout),
)
const documents = new Map<string, TextDocument>()
let previewEnabled = false
let contributions: unknown[] = []
let ready = Promise.resolve()

child.stderr.on("data", (data: Buffer) => process.stderr.write(data))
child.on("error", (error) => {
	process.stderr.write(`${error.message}\n`)
	process.exitCode = 1
	editor.dispose()
})
child.on("exit", (code) => {
	process.exitCode = code ?? 1
	editor.dispose()
	process.stdin.destroy()
})
editor.onClose(() => {
	upstream.dispose()
	child.kill()
})
upstream.onRequest((method, params, token) =>
	params === undefined
		? editor.sendRequest(method, token)
		: editor.sendRequest(method, params, token),
)
upstream.onNotification((method, params) =>
	params === undefined
		? editor.sendNotification(method)
		: editor.sendNotification(method, params),
)

editor.onRequest(async (method, rawParams, token) => {
	if (method === "initialize") {
		const params = rawParams as InitializeParams
		const options = (params.initializationOptions ?? {}) as {
			preview?: boolean
			contentMapperContributions?: unknown[]
		}
		previewEnabled = options.preview === true
		contributions = [
			{
				contributorId: "galley",
				extensions: [".mdx"],
				inferredProjectContribution: {
					manifest: {
						name: "galley",
						exec: [
							process.execPath,
							runtimeEntry("content-mapper", "mapper/server"),
						],
						compilerOptions: ["allowJs", "jsxImportSource"],
					},
				},
			},
			...(options.contentMapperContributions ?? []),
		]
		const initializationOptions = { ...options, runExternalCode: true }
		const result = await upstream.sendRequest<InitializeResult>(
			method,
			{ ...params, initializationOptions },
			token,
		)
		result.capabilities.completionProvider ??= {}
		result.capabilities.completionProvider.triggerCharacters = [
			...new Set([
				...(result.capabilities.completionProvider.triggerCharacters ?? []),
				'"',
				"'",
				"{",
				",",
			]),
		]
		return result
	}
	await ready
	const params = (rawParams ?? {}) as Partial<TextDocumentPositionParams> & {
		uri?: string
	}
	if (method === "galley/preview") {
		if (!previewEnabled)
			throw new Error(
				"Enable previews only for trusted workspaces (initializationOptions.preview).",
			)
		const document = params.uri ? documents.get(params.uri) : undefined
		if (!document) throw new Error("The MDX document is not open.")
		const version = document.version
		const result = await evaluatePreview(
			fileURLToPath(document.uri),
			document.getText(),
			token,
		)
		return { ...result, version }
	}
	const document = params.textDocument
		? documents.get(params.textDocument.uri)
		: undefined
	if (document && params.position) {
		const offset = document.offsetAt(params.position)
		const source = document.getText()
		if (method === "textDocument/completion") {
			const items = attributeCompletions(source, offset)
			if (items) return { isIncomplete: false, items }
		}
		if (method === "textDocument/hover") {
			const hover = attributeHover(source, offset)
			if (hover) return hover
		}
		if (method === "textDocument/definition") {
			const definition = await importDefinition(document.uri, source, offset)
			if (definition) return definition
			const result = await upstream.sendRequest<
				Location | (Location | LocationLink)[] | null
			>(method, rawParams, token)
			const locations = Array.isArray(result) ? result : result ? [result] : []
			if (locations.length === 1) {
				const location = locations[0]!
				const uri = "targetUri" in location ? location.targetUri : location.uri
				const position =
					"targetSelectionRange" in location
						? location.targetSelectionRange.start
						: location.range.start
				if (uri === document.uri) {
					const original = await importDefinition(
						uri,
						source,
						document.offsetAt(position),
					)
					if (original) return original
				}
			}
			return result
		}
	}
	return rawParams === undefined
		? upstream.sendRequest(method, token)
		: upstream.sendRequest(method, rawParams, token)
})

editor.onNotification(async (method, params) => {
	if (method === "initialized") {
		ready = (async () => {
			await upstream.sendNotification(method, params)
			await upstream.sendRequest("custom/setContentMapperContributions", {
				contributions,
				openDocuments: [],
			})
		})()
		await ready
		return
	}
	await ready
	if (method === "textDocument/didOpen") {
		const item = (params as DidOpenTextDocumentParams).textDocument
		documents.set(
			item.uri,
			TextDocument.create(item.uri, item.languageId, item.version, item.text),
		)
	} else if (method === "textDocument/didChange") {
		const change = params as DidChangeTextDocumentParams
		const document = documents.get(change.textDocument.uri)
		if (document)
			documents.set(
				document.uri,
				TextDocument.update(
					document,
					change.contentChanges,
					change.textDocument.version,
				),
			)
	} else if (method === "textDocument/didClose")
		documents.delete((params as DidCloseTextDocumentParams).textDocument.uri)
	if (params === undefined) await upstream.sendNotification(method)
	else await upstream.sendNotification(method, params)
})
upstream.listen()
editor.listen()
