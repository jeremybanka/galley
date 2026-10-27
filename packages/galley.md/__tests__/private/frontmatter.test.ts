import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, expect, test, vi } from "vite-plus/test"
import { parse } from "yaml"
import {
	compileMarkdown,
	Markdown,
	previewMarkdown,
	runGalley,
} from "../../src/index.ts"
import {
	closeProject,
	openProject,
	transform,
} from "../../src/mapper/transform.ts"
import relativeDocument from "#fixtures/frontmatter/relative.mdx" with { type: "text" }
import rootDocument from "#fixtures/frontmatter/root.mdx" with { type: "text" }
import multilineMetadata from "#fixtures/frontmatter/multiline.mdx" with { type: "text" }
import invalidYaml from "#fixtures/frontmatter/invalid-yaml.mdx" with { type: "text" }
import invalidSettings from "#fixtures/frontmatter/invalid-settings.mdx" with { type: "text" }
import invalidOutput from "#fixtures/frontmatter/invalid-output.mdx" with { type: "text" }
import emptyOutput from "#fixtures/frontmatter/empty-output.mdx" with { type: "text" }
import duplicateOutput from "#fixtures/frontmatter/duplicate-output.mdx" with { type: "text" }
import editorDocument from "#fixtures/frontmatter/editor.mdx" with { type: "text" }

const execute = promisify(execFile)
const cli = fileURLToPath(new URL("../../src/cli.ts", import.meta.url))
const directories: string[] = []

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	)
})

async function fixture(source: string) {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "galley-frontmatter-"),
	)
	directories.push(directory)
	const input = path.join(directory, "docs/source/README.mdx")
	await fs.mkdir(path.dirname(input), { recursive: true })
	await fs.writeFile(input, source)
	return { directory, input }
}

test("a root destination needs a repository, but explicit output overrides it", async () => {
	const { directory, input } = await fixture(rootDocument)
	const output = path.join(directory, "explicit.md")
	// A test runner's temporary directory may itself live inside a repository.
	const stat = vi
		.spyOn(fs, "stat")
		.mockRejectedValue(Object.assign(new Error("Missing"), { code: "ENOENT" }))
	try {
		await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
			"no .git directory or file",
		)
		expect(await runGalley(input, { mode: "write", output })).toMatchObject({
			outputPath: output,
			markdown: "# Root\n",
		})
	} finally {
		stat.mockRestore()
	}
	// Compilation and previews do not need to resolve a destination.
	expect(await compileMarkdown(input)).toBe("# Root\n")
	expect((await previewMarkdown(input)).markdown).toBe("# Root\n")
})

test.each(["/../escape.md", "/"])(
	"rejects an invalid root destination %s",
	async (output) => {
		const { directory, input } = await fixture(
			rootDocument.replace("/generated/root.md", output),
		)
		await fs.mkdir(path.join(directory, ".git"))
		await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
			"inside the repository",
		)
	},
)

// Five CLI processes share this budget, including startup on shared CI runners.
test("CLI write/check share frontmatter resolution and explicit paths stay relative to cwd", async () => {
	const { directory, input } = await fixture(rootDocument)
	await fs.mkdir(path.join(directory, ".git"))
	const run = (...args: string[]) =>
		execute(process.execPath, [cli, ...args], { cwd: path.dirname(input) })
	await expect(run("check")).rejects.toMatchObject({ code: 1 })
	await run("write")
	await run("check")
	expect(
		await fs.readFile(path.join(directory, "generated/root.md"), "utf8"),
	).toBe("# Root\n")
	await run("write", "README.mdx", "override.md")
	await run("check", "README.mdx", "override.md")
	expect(
		await fs.readFile(path.join(path.dirname(input), "override.md"), "utf8"),
	).toBe("# Root\n")
}, 20_000)

test("frontmatter cannot overwrite the source directly or through a symlink", async () => {
	const { directory, input } = await fixture(
		rootDocument.replace("/generated/root.md", "README.mdx"),
	)
	await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
		"must differ",
	)
	await fs.writeFile(input, rootDocument)
	await fs.mkdir(path.join(directory, ".git"))
	await fs.mkdir(path.join(directory, "generated"))
	await fs.symlink(input, path.join(directory, "generated/root.md"))
	await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
		"must differ",
	)
	expect(await fs.readFile(input, "utf8")).toBe(rootDocument)
})

test("removing Galley settings preserves significant trailing newlines in YAML values", async () => {
	const { input } = await fixture(multilineMetadata)
	const header = Markdown({ children: await compileMarkdown(input) })
		.children[0]
	if (header?.type !== "yaml") throw new Error("Expected frontmatter")
	expect(parse(`${header.value}\n`)).toEqual({
		description: "Keep these blank lines.\n\n\n",
	})
})

test.each([
	[invalidYaml, "Invalid YAML frontmatter"],
	[duplicateOutput, "Invalid YAML frontmatter"],
	[invalidSettings, "Frontmatter galley must be a mapping"],
	[invalidOutput, "Frontmatter galley.output must be a nonempty path string"],
	[emptyOutput, "Frontmatter galley.output must be a nonempty path string"],
])("invalid metadata reports its source: %s", async (source, message) => {
	const { input } = await fixture(source!)
	await expect(runGalley(input, { mode: "write" })).rejects.toThrow(
		`${input}: ${message}`,
	)
	await expect(compileMarkdown(input)).rejects.toThrow(message)
	expect(await fs.readdir(path.dirname(input))).toEqual(["README.mdx"])
})

test("unsaved previews preserve component offsets after frontmatter, including CRLF", async () => {
	const { input } = await fixture(rootDocument)
	const source = relativeDocument.replaceAll("\n", "\r\n")
	const preview = await previewMarkdown(input, { source })
	expect(preview.components).toHaveLength(1)
	const component = preview.components[0]!
	expect(source.slice(component.start, component.end)).toBe(
		'<Code source="sample" lang="text" />',
	)
	expect(component.markdown).toBe("```text\nsample\n```\n")
	expect(preview.markdown).not.toContain("galley:")
})

test("the editor ignores frontmatter expressions and maps imports and components to original offsets", async () => {
	const { input } = await fixture(editorDocument)
	await fs.writeFile(path.join(path.dirname(input), "example.ts"), "")
	const projectHandle = "frontmatter"
	await openProject({ projectHandle, configFileName: "", compilerOptions: {} })
	try {
		const result = transform({
			projectHandle,
			fileName: input,
			content: editorDocument,
		})
		expect(result.diagnostics).toEqual([])
		expect(result.text).toContain('import("galley.md").Component')
		expect(result.text).not.toContain("Bad")
		const componentOffset = editorDocument.indexOf("<Code />") + 1
		expect(
			result.mappings?.some(
				([, , original, length]) =>
					original <= componentOffset && componentOffset < original + length,
			),
		).toBe(true)
		for (const [v, vl, o, ol, kind] of result.mappings ?? []) {
			if (kind === 0)
				expect(result.text.slice(v, v + vl)).toBe(
					editorDocument.slice(o, o + ol),
				)
		}
	} finally {
		closeProject({ projectHandle })
	}
})
