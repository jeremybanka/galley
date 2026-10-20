import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterEach, describe, expect, test } from "vite-plus/test"

import { compileMarkdown, Markdown, runGalley } from "../src/index.ts"

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
	test("keeps inline expression whitespace and treats Markdown imports as data", async () => {
		const markdown =
			"<details>\n\nA **plain** document with {braces}.\n\n</details>\n"
		const { input } = await fixture({
			"plain.md": markdown,
			"README.mdx": `import Plain from './plain.md'
import raw from './plain.md' with { type: 'text' }
import { Code } from 'galley.mdx'

a{'\\n'}b

<Plain />

<Code source={raw} lang='md' />
`,
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
		const source = `# Hello **world**

*One*\n*two* and ~~three~~ with \`code\`, [a link](https://example.com), and ![an image](image.png).

> A quotation.

1. First
2. Second

- [x] Done
- [ ] Later

| Name | Size |
| :--- | ---: |
| example | 10 |

A [reference][target] and a footnote[^note].

[target]: https://example.com "Title"
[^note]: Footnote content.

---

\`\`\`ts
const value = 1
\`\`\`
`
		const { input } = await fixture({ "README.mdx": source })
		expect(
			withoutPositions(Markdown({ children: await compileMarkdown(input) })),
		).toEqual(withoutPositions(Markdown({ children: source })))
	})

	test("imports one source as distinct code components, reuses identical attributes, and never executes it", async () => {
		const source =
			'throw new Error("source must not execute")\nexport const fence: string = "```"\n'
		const { input } = await fixture({
			"example.ts": source,
			"README.mdx": `import TypeScript from './example.ts' with { type: 'code', lang: 'ts' }
import Plain from './example.ts' with { type: 'code', lang: 'text' }
import Again from './example.ts' with { lang: 'ts', type: 'code' }
import Inferred from './example.ts' with { type: 'code' }

{TypeScript === Again && TypeScript !== Plain && TypeScript !== Inferred ? 'identity passed' : 'identity failed'}

<TypeScript />

<Plain />

<Inferred />
`,
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
			"example.ts": 'export const value: string = "runtime value"\n',
			"note.txt": "a raw string",
			"README.mdx": `import { value } from './example.ts'
import Example from './example.ts' with { type: 'code' }
import note from './note.txt' with { type: 'text' }

{value} and {note}

<Example />
`,
		})
		const output = await compileMarkdown(input)
		expect(output).toContain("runtime value and a raw string")
		expect(output).toContain('export const value: string = "runtime value"')
	})

	test("supports async components, props, TSX, and nested document directories", async () => {
		const { directory, input } = await fixture({
			"README.mdx": "import Nested from './nested/section.mdx'\n\n<Nested />\n",
			"nested/section.mdx":
				"import { Greeting } from '../component.tsx'\n\n## Nested\n\n<Greeting name='Ada' />\n",
			"component.tsx": `export async function Greeting({ name }: { name: string }, context: { directory: string }) {
await Promise.resolve()
return <p>Hello <strong>{name}</strong> from {context.directory}</p>
}`,
		})
		expect(await compileMarkdown(input)).toBe(
			`## Nested\n\nHello **Ada** from ${directory}/nested\n`,
		)
	})

	test("allows third-party plugins to consume arbitrary attributes with native module identity", async () => {
		const { input } = await fixture({
			"README.mdx": `import One from 'virtual:example' with { type: 'custom', label: 'one' }
import Two from 'virtual:example' with { type: 'custom', label: 'two' }
import Again from 'virtual:example' with { label: 'one', type: 'custom' }

{One === Again && One !== Two ? 'identity passed' : 'identity failed'}

<One />

<Two />
`,
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
								contents: `export default function Example() { return ${JSON.stringify(args.with.label)} }`,
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
			"README.mdx":
				"import { Greeting } from './component.ts'\n\n<Greeting />\n",
			"component.ts": "export function Greeting() { return 'before' }",
		})
		expect(await compileMarkdown(input)).toBe("before\n")
		await fs.writeFile(
			path.join(directory, "component.ts"),
			"export function Greeting() { return 'after' }",
		)
		expect(await compileMarkdown(input)).toBe("after\n")
	})

	test.each([
		[
			"import Missing from './missing.ts' with { type: 'code' }\n\n<Missing />",
			"missing.ts",
		],
		[
			"import Code from './example.ts' with { type: 'code', language: 'ts' }\n\n<Code />",
			"Unknown code import attribute: language",
		],
		[
			"import Code from './example.ts' with { type: 'code', lang: 'bad`language' }\n\n<Code />",
			"Code languages",
		],
		["<div>Unsupported</div>", "Unsupported Markdown element <div>"],
	])("reports invalid input: %s", async (document, error) => {
		const { input } = await fixture({
			"README.mdx": document,
			"example.ts": "export {}",
		})
		await expect(compileMarkdown(input)).rejects.toThrow(error)
	})

	test("write and check handle missing and stale output without modifying the source", async () => {
		const source = "# Generated\n"
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
			"README.mdx": "# CLI\n",
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
		await fs.writeFile(
			input,
			'export const broken = (() => { throw new Error("must not evaluate") })()',
		)
		expect((await run("--help")).stdout).toContain("galley")
		await expect(run("unknown")).rejects.toMatchObject({ code: 1 })
	})
})
