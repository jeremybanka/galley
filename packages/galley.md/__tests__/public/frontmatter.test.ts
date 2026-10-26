import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { runGalley } from "galley.md"
import { parse } from "yaml"
import { fixture as project, parseMarkdown } from "./support.ts"

import relativeDocument from "#fixtures/public/frontmatter/relative.mdx" with { type: "text" }
import rootDocument from "#fixtures/public/frontmatter/root.mdx" with { type: "text" }
import documentMetadata from "#fixtures/public/frontmatter/document.mdx" with { type: "text" }
import parentDocument from "#fixtures/public/frontmatter/parent.mdx" with { type: "text" }

async function fixture(source: string) {
	const result = await project({ "docs/source/README.mdx": source })
	return {
		...result,
		input: path.join(result.directory, "docs/source/README.mdx"),
	}
}

test("relative destinations use the source directory; check never creates directories", async () => {
	const { directory, input } = await fixture(relativeDocument)
	const outputPath = path.join(directory, "generated/README.md")
	expect(await runGalley(input, { mode: "check" })).toMatchObject({
		changed: true,
		outputPath,
	})
	await expect(fs.stat(path.dirname(outputPath))).rejects.toMatchObject({
		code: "ENOENT",
	})
	const written = await runGalley(input, { mode: "write" })
	expect(parseMarkdown(written.markdown).children.slice(1)).toEqual(
		parseMarkdown("# Guide\n\n```text\nsample\n```\n").children,
	)
	expect(written.outputPath).toBe(outputPath)
	expect(await fs.readFile(outputPath, "utf8")).toBe(written.markdown)
	expect(await runGalley(input, { mode: "check" })).toMatchObject({
		changed: false,
		outputPath,
	})
	await fs.writeFile(outputPath, "stale")
	expect((await runGalley(input, { mode: "check" })).changed).toBe(true)
	expect(await fs.readFile(outputPath, "utf8")).toBe("stale")
	expect(await fs.readFile(input, "utf8")).toBe(relativeDocument)
	const header = parseMarkdown(written.markdown).children[0]
	expect(header?.type).toBe("yaml")
	if (header?.type !== "yaml") throw new Error("Expected frontmatter")
	expect(parse(`${header.value}\n`)).toEqual({
		title: "A {guide}",
		tags: ["docs", "mdx"],
	})
	expect(written.markdown).not.toContain("galley:")
})

test("imported document destinations never cause additional writes", async () => {
	const { directory, input } = await fixture(parentDocument)
	await fs.mkdir(path.join(directory, ".git"))
	await fs.writeFile(path.join(path.dirname(input), "child.mdx"), rootDocument)
	const result = await runGalley(input, { mode: "write" })
	expect(result.outputPath).toBe(input.replace(/\.mdx$/, ".md"))
	expect(parseMarkdown(result.markdown)).toEqual(
		parseMarkdown("# Parent\n\n# Root"),
	)
	await expect(
		fs.stat(path.join(directory, "generated")),
	).rejects.toMatchObject({ code: "ENOENT" })
})

test("ordinary frontmatter preserves comments and values and keeps the default destination", async () => {
	const { input } = await fixture(documentMetadata)
	const result = await runGalley(input, { mode: "check" })
	expect(result.outputPath).toBe(input.replace(/\.mdx$/, ".md"))
	const nodes = parseMarkdown(result.markdown).children
	const header = nodes[0]
	if (header?.type !== "yaml") throw new Error("Expected frontmatter")
	expect(parse(header.value)).toEqual({
		title: "A {guide}",
		tags: ["docs", "mdx"],
	})
	expect(header.value).toContain("# A document comment")
	expect(nodes.slice(1)).toEqual(parseMarkdown("# Guide").children)
})

test.each(["directory", "file"])(
	"root destinations find the nearest .git %s from the source",
	async (marker) => {
		const { directory, input } = await fixture(rootDocument)
		await fs.mkdir(path.join(directory, ".git"))
		const root = path.join(directory, "docs")
		if (marker === "directory") await fs.mkdir(path.join(root, ".git"))
		else
			await fs.writeFile(
				path.join(root, ".git"),
				"gitdir: ../.git/worktrees/docs\n",
			)
		const result = await runGalley(input, { mode: "write" })
		expect(result.outputPath).toBe(path.join(root, "generated/root.md"))
		expect(parseMarkdown(result.markdown)).toEqual(parseMarkdown("# Root"))
	},
)

test("explicit output overrides the document destination", async () => {
	const { directory, input } = await fixture(rootDocument)
	await fs.mkdir(path.join(directory, ".git"))
	const output = path.join(directory, "override.md")
	const result = await runGalley(input, { mode: "write", output })
	expect(result.outputPath).toBe(output)
	expect(parseMarkdown(await fs.readFile(output, "utf8"))).toEqual(
		parseMarkdown("# Root"),
	)
	await expect(
		fs.stat(path.join(directory, "generated")),
	).rejects.toMatchObject({ code: "ENOENT" })
})
