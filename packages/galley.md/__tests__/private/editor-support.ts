// SPDX-License-Identifier: MPL-2.0
import { execFile, spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { afterEach, expect } from "vite-plus/test"
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-jsonrpc/node"
import editorSource from "#fixtures/editor/example.ts" with { type: "text" }

const execute = promisify(execFile)

const root = fileURLToPath(new URL("../../", import.meta.url))

const directories: string[] = []

const cleanups: (() => void)[] = []

afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) cleanup()
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	)
})

async function fixture(source: string) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "galley-editor-"))
	directories.push(directory)
	await fs.mkdir(path.join(directory, "node_modules/galley.md"), {
		recursive: true,
	})
	await fs.writeFile(
		path.join(directory, "node_modules/galley.md/package.json"),
		JSON.stringify({
			name: "galley.md",
			type: "module",
			exports: { ".": "./index.ts", "./jsx-runtime": "./jsx-runtime.ts" },
			typescript: {
				contentMapper: {
					exec: [process.execPath, path.join(root, "src/mapper/server.ts")],
					compilerOptions: ["allowJs", "jsxImportSource"],
				},
			},
		}),
	)
	for (const entry of ["index", "jsx-runtime"])
		await fs.writeFile(
			path.join(directory, `node_modules/galley.md/${entry}.ts`),
			`export * from ${JSON.stringify(path.join(root, `src/${entry}.ts`))}`,
		)
	await fs.mkdir(path.join(directory, "node_modules/@types"), {
		recursive: true,
	})
	await fs.symlink(
		path.join(root, "node_modules/@types/node"),
		path.join(directory, "node_modules/@types/node"),
	)
	await fs.writeFile(path.join(directory, "package.json"), '{"type":"module"}')
	await fs.writeFile(
		path.join(directory, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				checkJs: true,
				allowJs: true,
				jsx: "react-jsx",
				jsxImportSource: "galley.md",
				module: "nodenext",
				noEmit: true,
				skipLibCheck: true,
				allowImportingTsExtensions: true,
				types: ["node"],
				target: "esnext",
			},
			contentMappers: [{ package: "galley.md", extensions: [".mdx"] }],
			include: ["README.mdx"],
		}),
	)
	await fs.writeFile(path.join(directory, "example.ts"), editorSource)
	await fs.writeFile(path.join(directory, "README.mdx"), source)
	return { directory, input: path.join(directory, "README.mdx") }
}

function positionOf(source: string, text: string, offset = 0) {
	const index = source.indexOf(text)
	expect(index, `Missing fixture text: ${text}`).toBeGreaterThanOrEqual(0)
	const prefix = source.slice(0, index + offset)
	return {
		line: prefix.split("\n").length - 1,
		character: prefix.length - prefix.lastIndexOf("\n") - 1,
	}
}

function diagnosticLocation(source: string, text: string, offset = 0) {
	const { line, character } = positionOf(source, text, offset)
	return `README.mdx(${line + 1},${character + 1})`
}

async function lsp(
	directory: string,
	preview = false,
	registrations: { method: string }[] = [],
) {
	const child = spawn(
		process.execPath,
		[path.join(root, "src/lsp/server.ts")],
		{ cwd: directory, stdio: ["pipe", "pipe", "pipe"] },
	)
	let stderr = ""
	child.stderr.on("data", (data) => {
		stderr += String(data)
	})
	const connection = createMessageConnection(
		new StreamMessageReader(child.stdout),
		new StreamMessageWriter(child.stdin),
	)
	cleanups.push(() => {
		connection.dispose()
		child.kill()
	})
	connection.onRequest(
		"workspace/configuration",
		({ items }: { items: unknown[] }) => items.map(() => null),
	)
	connection.onRequest(
		"client/registerCapability",
		(params: { registrations: { method: string }[] }) => {
			registrations.push(...params.registrations)
			return null
		},
	)
	connection.listen()
	const result = await connection.sendRequest<{ capabilities: unknown }>(
		"initialize",
		{
			processId: process.pid,
			rootUri: pathToFileURL(directory).href,
			capabilities: {
				textDocument: {
					synchronization: { dynamicRegistration: true },
					hover: { dynamicRegistration: true },
					completion: { completionItem: { snippetSupport: true } },
					diagnostic: { dynamicRegistration: true },
				},
				workspace: { configuration: true },
			},
			initializationOptions: { preview },
		},
	)
	expect(result.capabilities, stderr).toBeTruthy()
	await connection.sendNotification("initialized", {})
	return connection
}

export { execute, root, fixture, positionOf, diagnosticLocation, lsp }
