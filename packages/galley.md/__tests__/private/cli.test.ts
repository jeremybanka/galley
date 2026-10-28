import fs from "node:fs/promises"
import { expect, test } from "vite-plus/test"
import { fixture, runCli } from "../public/support.ts"
import invalidDocument from "#fixtures/compiler/invalid/element.mdx" with { type: "text" }
import currentDocument from "#fixtures/cli/current.mdx" with { type: "text" }
import staleDocument from "#fixtures/cli/stale.md" with { type: "text" }

test("root help aliases show the same help without compiling a document", async () => {
	const { directory } = await fixture({ "README.mdx": invalidDocument })
	const results = []
	for (const args of [[], ["-h"], ["--help"], ["help"]]) {
		const { stdout, stderr } = await runCli(directory, ...args)
		expect(stderr).toBe("")
		expect(stdout).toContain("galley help")
		expect(stdout.match(/-h, --help/g)).toHaveLength(1)
		results.push(stdout)
	}
	expect(new Set(results).size).toBe(1)
	expect(await fs.readdir(directory)).toEqual(["README.mdx"])
})

test("check shows changed lines in separate contextual hunks without writing output", async () => {
	const { directory, output } = await fixture({
		"README.mdx": currentDocument,
		"README.md": staleDocument,
	})
	await expect(runCli(directory, "check")).rejects.toMatchObject({
		code: 1,
		stdout: "",
		stderr: expect.stringContaining(
			"--- README.md\texisting\n+++ README.md\tgenerated\n" +
				"@@ -1,4 +1,4 @@\n-# Old guide\n+# Current guide\n \n Opening paragraph.\n \n" +
				"@@ -12,4 +12,4 @@\n \n ## Closing\n \n-Old closing paragraph.\n+Current closing paragraph.\n",
		),
	})
	expect(await fs.readFile(output, "utf8")).toBe(staleDocument)
})

test("check shows missing explicit output as additions without creating directories", async () => {
	const { directory } = await fixture({ "README.mdx": currentDocument })
	await expect(
		runCli(directory, "check", "README.mdx", "docs/guide.md"),
	).rejects.toMatchObject({
		code: 1,
		stdout: "",
		stderr: expect.stringContaining(
			"--- /dev/null\texisting\n+++ docs/guide.md\tgenerated\n@@ -0,0 +1,15 @@\n+# Current guide\n",
		),
	})
	expect(await fs.readdir(directory)).toEqual(["README.mdx"])
})

test("check explains a missing final newline", async () => {
	const previous = currentDocument.trimEnd()
	const { directory, output } = await fixture({
		"README.mdx": currentDocument,
		"README.md": previous,
	})
	await expect(runCli(directory, "check")).rejects.toMatchObject({
		code: 1,
		stderr: expect.stringContaining(
			"-Current closing paragraph.\n\\ No newline at end of file\n+Current closing paragraph.\n",
		),
	})
	expect(await fs.readFile(output, "utf8")).toBe(previous)
})

test("check emits no diff for current output", async () => {
	const { directory } = await fixture({
		"README.mdx": currentDocument,
		"README.md": currentDocument,
	})
	const { stdout, stderr } = await runCli(directory, "check")
	expect(stderr).toBe("")
	expect(stdout).toBe("README.md is already up to date.\n")
})
