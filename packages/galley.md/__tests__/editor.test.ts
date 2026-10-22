import { execFile, spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { afterEach, expect, test } from "vite-plus/test"
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-jsonrpc/node"
import { previewMarkdown } from "../src/compile.ts"
import { evaluatePreview } from "../src/editor/preview.ts"
import {
	openProject,
	closeProject,
	transform,
} from "../src/mapper/transform.ts"
import { previewSummary } from "../src/vscode/preview-model.ts"

const execute = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
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
	await fs.writeFile(
		path.join(directory, "example.ts"),
		'throw new Error("must not execute")\nexport const value = 123\n',
	)
	await fs.writeFile(path.join(directory, "README.mdx"), source)
	return { directory, input: path.join(directory, "README.mdx") }
}

test("composes UTF-16 source maps and keeps attributed imports distinct from ordinary imports", async () => {
	const source = `# 👻 Preview\n\nimport { value } from './example.ts'\nimport Code from './example.ts' with { type: 'code', lang: 'ts' }\nimport Text from './example.ts' with { type: 'text' }\n\n<Code />\n\n{Text.toUpperCase()} {value}\n`
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
	expect(result.text).toContain("import { value } from './example.ts'")
	expect(result.text).toContain('import("galley.md").Component')
	expect(result.text).toContain("@type {string}")
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
	const content = `import One from 'virtual:x' with { type: 'custom', variant: 'one' }\nimport Two from 'virtual:x' with { type: 'custom', variant: 'bad' }\nimport Bad from './x.ts' with { type: 'code', language: 'ts' }\n\n{One + Two}\n`
	const result = transform({
		projectHandle: "custom",
		fileName: "/tmp/README.mdx",
		content,
	})
	expect(result.text).toContain("@type {number}")
	expect(result.diagnostics).toHaveLength(3)
	expect(
		content.slice(
			result.diagnostics![0]!.start,
			result.diagnostics![0]!.start + result.diagnostics![0]!.length,
		),
	).toBe("'bad'")
	expect(result.diagnostics![2]!.messageText).toContain("language")
	closeProject({ projectHandle: "custom" })
})

test("TypeScript 7.1 checks real attributed imports and maps errors back to MDX", async () => {
	const { directory, input } = await fixture(
		`import { value } from './example.ts'\nimport Code from './example.ts' with { type: 'code', lang: 'ts' }\nimport Text from './example.ts' with { type: 'text' }\n\n<Code />\n\n{Text.toUpperCase()} {value.toFixed(0)}\n`,
	)
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
	await fs.appendFile(
		input,
		"\n<Text />\n\n{Text.toFixed(2)}\n\n<Code invalid='prop' />\n",
	)
	await expect(check()).rejects.toMatchObject({
		stdout: expect.stringMatching(/README\.mdx\(9,/),
	})
	try {
		await check()
	} catch (error) {
		const output = (error as { stdout: string }).stdout
		expect(output).toContain("toFixed")
		expect(output).toContain("README.mdx(13,")
		expect(output).not.toContain("no default export")
	}
}, 20_000)

test("TypeScript checks native tables and HTML table attributes in MDX and TSX", async () => {
	const { directory, input } = await fixture(
		`import { Html } from 'galley.md'\n\n<table><thead><tr><th align="right">Size</th></tr></thead><tbody><tr><td>{12}</td></tr></tbody></table>\n`,
	)
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
	await fs.writeFile(
		path.join(directory, "table.tsx"),
		`import { Html } from 'galley.md'\nexport function Table() { return <table><tr key="header"><th align="center">Name</th></tr><tr><td>galley</td></tr></table> }`,
	)
	await fs.appendFile(
		input,
		"\nimport { Table } from './table.tsx'\n\n<Table />\n",
	)
	await expect(check()).resolves.toMatchObject({ stdout: "" })
	await fs.appendFile(
		input,
		'\n<Html><table className="wide"><tr><th align="justify">Size</th></tr></table></Html>\n',
	)
	await fs.appendFile(
		path.join(directory, "table.tsx"),
		"\nexport const markup = <Html><table><tr><td colSpan={2}>merged</td></tr></table></Html>\n",
	)
	await expect(check()).resolves.toMatchObject({ stdout: "" })
}, 20_000)

test("TypeScript checks Html boundaries with markup tables and custom elements", async () => {
	const { directory } = await fixture(`import { Html } from 'galley.md'

<Html>
  <div align="center"><img src="logo.png" width={160} /><h1><code>Package</code></h1></div>
  <table><tbody><tr><td colSpan={2}>Markup</td></tr></tbody></table>
  <custom-badge data-label="example" />
</Html>
`)
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

test("previews use unsaved source, evaluate each component once, and retain nested document context", async () => {
	const { directory, input } = await fixture("# Saved\n")
	await fs.mkdir(path.join(directory, "nested"))
	await fs.writeFile(
		path.join(directory, "nested/section.mdx"),
		"import { Count } from '../component.ts'\n\n<Count />\n",
	)
	await fs.writeFile(
		path.join(directory, "component.ts"),
		`import fs from 'node:fs'; export function Count(_, context) { fs.appendFileSync(${JSON.stringify(path.join(directory, "count"))}, '1'); console.log('component stdout'); return 'From ' + context.directory }`,
	)
	const result = await previewMarkdown(input, {
		source: "import Section from './nested/section.mdx'\n\n<Section />\n",
	})
	expect(await fs.readFile(path.join(directory, "count"), "utf8")).toBe("1")
	expect(result.markdown).toBe(`From ${directory}/nested\n`)
	expect(result.components).toHaveLength(2)
	expect(
		result.components.every(({ markdown }) => markdown === result.markdown),
	).toBe(true)
	expect(result.dependencies).toContain(path.join(directory, "component.ts"))
	expect(await fs.readFile(input, "utf8")).toBe("# Saved\n")
	const isolated = await evaluatePreview(
		input,
		"import Code from './example.ts' with { type: 'code' }\n\n<Code />\n",
	)
	expect(isolated.components[0]!.markdown).toContain("must not execute")
	await expect(
		evaluatePreview(
			input,
			"export const wait = await new Promise(() => {})\n\n# Wait\n",
			undefined,
			100,
		),
	).rejects.toThrow("timed out")
}, 20_000)

async function lsp(directory: string, preview = false) {
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
	connection.onRequest("client/registerCapability", () => null)
	connection.listen()
	const result = await connection.sendRequest<{ capabilities: unknown }>(
		"initialize",
		{
			processId: process.pid,
			rootUri: pathToFileURL(directory).href,
			capabilities: {
				textDocument: {
					completion: { completionItem: { snippetSupport: true } },
					diagnostic: {},
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

test("LSP serves attribute completion, definitions, real TypeScript hover, and isolated versioned previews", async () => {
	const source = `import { value } from './example.ts'\nimport Code from './example.ts' with { type: 'code', lang: 'ts' }\n\n<Code />\n\n{value}\n`
	const { directory, input } = await fixture(source)
	await fs.writeFile(
		path.join(directory, "example.ts"),
		'console.log("component stdout must not corrupt LSP")\nexport const value = 123\n',
	)
	const connection = await lsp(directory, true)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: { uri, languageId: "galley", version: 1, text: source },
	})
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position: { line: 5, character: 2 },
	})
	expect(JSON.stringify(hover)).toContain("123")
	const locations = await connection.sendRequest<{ uri: string }[]>(
		"textDocument/definition",
		{ textDocument: { uri }, position: { line: 1, character: 25 } },
	)
	expect(locations[0]?.uri).toBe(
		pathToFileURL(path.join(directory, "example.ts")).href,
	)
	const usage = await connection.sendRequest<{ uri: string }[]>(
		"textDocument/definition",
		{ textDocument: { uri }, position: { line: 3, character: 2 } },
	)
	expect(usage[0]?.uri).toBe(locations[0]?.uri)
	const rename = await connection.sendRequest("textDocument/rename", {
		textDocument: { uri },
		position: { line: 3, character: 2 },
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
		contentChanges: [
			{ text: `import Code from './example.ts' with { type: "co` },
		],
	})
	const completion = await connection.sendRequest<{
		items: { label: string }[]
	}>("textDocument/completion", {
		textDocument: { uri },
		position: { line: 0, character: 46 },
	})
	expect(completion.items.map(({ label }) => label)).toContain("code")
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("standalone LSP does not evaluate previews without explicit trust", async () => {
	const { directory, input } = await fixture("# Readme\n")
	const connection = await lsp(directory)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: { uri, languageId: "galley", version: 1, text: "# Readme\n" },
	})
	await expect(
		connection.sendRequest("galley/preview", { uri }),
	).rejects.toThrow("trusted")
}, 20_000)

test("native ghost summaries retain a line count and bound very long output", () => {
	expect(previewSummary("```ts\nconst x = 1\n```\n")).toBe(
		"  → const x = 1 · 3 lines",
	)
	expect(previewSummary("x".repeat(1000)).length).toBeLessThan(120)
})

test("inferred projects receive the TypeScript mapper without a tsconfig", async () => {
	const source =
		"import Code from './example.ts' with { type: 'code' }\n\n<Code />\n"
	const { directory, input } = await fixture(source)
	await fs.unlink(path.join(directory, "tsconfig.json"))
	const connection = await lsp(directory)
	const uri = pathToFileURL(input).href
	await connection.sendNotification("textDocument/didOpen", {
		textDocument: { uri, languageId: "galley", version: 1, text: source },
	})
	const hover = await connection.sendRequest("textDocument/hover", {
		textDocument: { uri },
		position: { line: 2, character: 2 },
	})
	expect(JSON.stringify(hover)).toContain("Component")
	await connection.sendRequest("shutdown")
	await connection.sendNotification("exit")
}, 20_000)

test("inline component previews preserve the exact document output and source offsets", async () => {
	const { directory, input } = await fixture("# Saved\n")
	await fs.writeFile(
		path.join(directory, "inline.ts"),
		"export function Name() { return { type: 'strong', children: [{ type: 'text', value: 'Ada' }] } }",
	)
	const source =
		"import * as names from './inline.ts'\n\nHello <names.Name />, welcome.\n"
	const result = await previewMarkdown(input, { source })
	expect(result.markdown).toBe("Hello **Ada**, welcome.\n")
	expect(result.components).toHaveLength(1)
	const preview = result.components[0]!
	expect(source.slice(preview.start, preview.end)).toBe("<names.Name />")
	expect(preview.markdown).toBe("**Ada**\n")
})

test("Markdown links retain embedded expressions and source maps without breaking TypeScript projection", async () => {
	const source = `import Text from './example.ts' with { type: 'text' }

# A **heading**

[**{Text.toUpperCase()}**](./example.ts) and a [reference][target].

![An image](./example.svg)

> Quoted *text* with \`code\`.

- First
- Second

\`\`\`ts
const example: string = 'source'
\`\`\`

[target]: ./example.ts
`
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
		stdout: expect.stringContaining("README.mdx(5,10)"),
	})
}, 20_000)
