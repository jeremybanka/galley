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
	test("preserves README markup and attributes inside Html and escapes text", async () => {
		const { input } = await fixture({
			"README.mdx": `import { Html } from 'galley.md'

<Html>
  <div align="center">
    <img src="logo.png" alt="Logo" width={160} height={160} />
    <h1 align="center"><code>atom.io</code></h1>
    <a href="https://example.com/?a=1&b=2" aria-label="Read docs" title={'Say "hello"'}>Read <i>the docs</i></a>
    <p>{'<script>alert("hello")</script> & text'}</p>
    <input disabled hidden={false} aria-hidden={false} data-label="example" />
    <label htmlFor="name" className={['label', 'wide']} style="color: red" title={null}>Name</label>
  </div>
</Html>

<p>Markdown <strong>still works</strong>.</p>
`,
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
			"README.mdx": `import { Html } from 'galley.md'

<table>
  <thead><tr><th>Format</th><th>Value</th></tr></thead>
  <tbody><tr><td>Markdown</td><td><strong>one</strong></td></tr></tbody>
</table>

<Html>
  <table align="center">
    <thead><tr><th colSpan={2}>Markup</th></tr></thead>
    <tbody><tr><td>HTML</td><td><strong>two</strong></td></tr></tbody>
  </table>
</Html>
`,
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
			"README.mdx": `import { Html, Markdown } from 'galley.md'
import { Badge } from './badge.tsx'

<Html>
  <div><Badge />{' '}{null}{false}{[1, ' & ', 2]}<Html><i>nested</i></Html></div>
  <Markdown children={'| Name | Value |\\n| --- | --- |\\n| Example | **bold** |'} />
</Html>
`,
			"badge.tsx": `let count = 0
export async function Badge(_, context) {
  await Promise.resolve()
  return <span data-count={++count} title={context.directory}>A &amp; B</span>
}`,
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
		const markdown =
			"<details>\n\nA **plain** document with {braces}.\n\n</details>\n"
		const { input } = await fixture({
			"plain.md": markdown,
			"README.mdx": `import Plain from './plain.md'
import raw from './plain.md' with { type: 'text' }
import { Code } from 'galley.md'

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

	test("compiles native tables with column alignment, inline Markdown, and escaped cells", async () => {
		const { input } = await fixture({
			"README.mdx": `<table>
  <thead>
    <tr><th align="left">Name</th><th align="center">Status</th><th align="right">Size</th><th>Note</th></tr>
  </thead>
  <tbody>
    <tr><td><a href="https://example.com">galley</a></td><td>**Ready**</td><td>{12}</td><td>{'a|b'}</td></tr>
    <tr><td>Other</td><td><em>Pending</em></td><td>{0}</td><td /></tr>
  </tbody>
</table>`,
		})
		const output = await compileMarkdown(input)
		expect(withoutPositions(Markdown({ children: output }))).toEqual(
			withoutPositions(
				Markdown({
					children: `| Name | Status | Size | Note |
| :--- | :---: | ---: | --- |
| [galley](https://example.com) | **Ready** | 12 | a\\|b |
| Other | *Pending* | 0 | |
`,
				}),
			),
		)
		expect(output).not.toContain("<table>")
	})

	test("supports direct rows, header-only tables, and soft wrapping in cells", async () => {
		const { input } = await fixture({
			"README.mdx": `<table>
  <tr><th>Name</th></tr>
  <tr><td>soft
wrap</td></tr>
</table>

<table><thead><tr><th align="right">Count</th></tr></thead><tbody /></table>`,
		})
		expect(
			withoutPositions(Markdown({ children: await compileMarkdown(input) })),
		).toEqual(
			withoutPositions(
				Markdown({
					children: "| Name |\n| --- |\n| soft wrap |\n\n| Count |\n| ---: |\n",
				}),
			),
		)
	})

	test("resolves async table components and fragments once and previews partial rows", async () => {
		const { input } = await fixture({
			"README.mdx": `import { Header, Rows } from './table.tsx'

<table>
  <Header />
  <tbody>
    <Rows />
    {[3].map(value => <tr><td>{value}</td><td>expression</td></tr>)}
  </tbody>
</table>`,
			"table.tsx": `let calls = 0
export function Header() {
  return <thead><tr><th align="right">Value</th><th>Label</th></tr></thead>
}
async function Cells({ value }: { value: number }) {
  return <><td>{value}</td><td><strong>a|b</strong></td></>
}
export async function Rows() {
  if (++calls > 1) throw new Error('evaluated twice')
  return <>{[1, 2].map(value => <tr key={value}><Cells value={value} /></tr>)}</>
}`,
		})
		const result = await previewMarkdown(input)
		expect(result.markdown).toBe(await compileMarkdown(input))
		expect(withoutPositions(Markdown({ children: result.markdown }))).toEqual(
			withoutPositions(
				Markdown({
					children:
						"| Value | Label |\n| ---: | --- |\n| 1 | **a\\|b** |\n| 2 | **a\\|b** |\n| 3 | expression |\n",
				}),
			),
		)
		expect(result.components).toHaveLength(3)
		expect(result.components[1]?.markdown).toContain("a\\|b")
	})

	test.each([
		["<table />", "exactly one header row"],
		["<tr><th>Name</th></tr>", "<tr> must be inside"],
		["<table><th>Name</th></table>", "<th> must be inside <tr>"],
		["<table><thead><td>Name</td></thead></table>", "<td> must be inside <tr>"],
		[
			"<table><tbody><thead /></tbody></table>",
			"<thead> must be inside <table>",
		],
		["<table><tr><td>Name</td></tr></table>", "exactly one header row"],
		["<table><thead /></table>", "<thead> must contain exactly one"],
		[
			"<table><thead><tr><th>A</th></tr><tr><th>B</th></tr></thead></table>",
			"<thead> must contain exactly one",
		],
		[
			"<table><tr><th>A</th></tr><tr><th>B</th></tr></table>",
			"exactly one header row",
		],
		[
			"<table><tbody><tr><th>A</th></tr></tbody></table>",
			"<tbody> must contain only body rows",
		],
		[
			"<table><tr><th>A</th><td>B</td></tr></table>",
			"cannot mix <th> and <td>",
		],
		[
			"<table><tr><th>A</th><th>B</th></tr><tr><td>C</td></tr></table>",
			"Table row 2 has 1 cells; expected 2",
		],
		[
			"<table><tr><th>A</th></tr><tr><td>B</td><td>C</td></tr></table>",
			"Table row 2 has 2 cells; expected 1",
		],
		["<table><tr /></table>", "<tr> must contain one or more"],
		["<table><tr>text</tr></table>", "<tr> must contain one or more"],
		["<table>text</table>", "<table> must contain table rows"],
		["<table><p>text</p></table>", "Unsupported element <p> inside <table>"],
		[
			"<table><caption>Title</caption></table>",
			"Unsupported table element <caption>",
		],
		["<table><tfoot /></table>", "Unsupported table element <tfoot>"],
		["<table><colgroup /></table>", "Unsupported table element <colgroup>"],
		["<table><col /></table>", "Unsupported table element <col>"],
		[
			"<table className='wide' />",
			'Unsupported attribute "className" on <table>',
		],
		[
			"<table style={{width: 100}} />",
			'Unsupported attribute "style" on <table>',
		],
		[
			"<table><tr><th colSpan={2}>A</th></tr></table>",
			'Unsupported attribute "colSpan" on <th>',
		],
		[
			"<table><tr><th rowSpan={2}>A</th></tr></table>",
			'Unsupported attribute "rowSpan" on <th>',
		],
		[
			"<table><tr align='right'><th>A</th></tr></table>",
			'Unsupported attribute "align" on <tr>',
		],
		[
			"<table><tr><th align='justify'>A</th></tr></table>",
			"Invalid <th> alignment",
		],
		[
			"<table><tr><th align={null}>A</th></tr></table>",
			"Invalid <th> alignment",
		],
		[
			"<table><tr><th>A</th></tr><tr><td align='right'>B</td></tr></table>",
			'Unsupported attribute "align" on <td>',
		],
		[
			"<table><tr><th><table /></th></tr></table>",
			"Nested tables cannot be represented",
		],
		[
			"<table><tr><th>A<br />B</th></tr></table>",
			"Table cells support inline content only; found break",
		],
		[
			"<table><tr><th><p>A</p><p>B</p></th></tr></table>",
			"Table cells support inline content only; found paragraph",
		],
		[
			"<table><tr><th>\n\n- item\n\n</th></tr></table>",
			"Table cells support inline content only; found list",
		],
	])("rejects unsupported table markup: %s", async (source, error) => {
		const { input } = await fixture({ "README.mdx": source })
		await expect(compileMarkdown(input)).rejects.toThrow(error)
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
