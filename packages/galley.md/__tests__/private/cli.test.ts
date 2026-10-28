import fs from "node:fs/promises"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"
import { fixture, runCli } from "../public/support.ts"
import invalidDocument from "#fixtures/compiler/invalid/element.mdx" with { type: "text" }
import currentDocument from "#fixtures/cli/current.mdx" with { type: "text" }
import staleDocument from "#fixtures/cli/stale.md" with { type: "text" }
import staleDiff from "#fixtures/cli/stale.expected.md" with { type: "text" }
import whitespaceDocument from "#fixtures/cli/whitespace.mdx" with { type: "text" }
import whitespaceStale from "#fixtures/cli/whitespace-stale.md" with { type: "text" }

beforeEach(() => {
	vi.stubEnv("FORCE_COLOR", "0")
	vi.stubEnv("NO_COLOR", undefined)
	vi.stubEnv("NODE_DISABLE_COLORS", undefined)
	vi.stubEnv("TERM", undefined)
})
// cspell:ignore unstub
afterEach(() => vi.unstubAllEnvs())

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
		stderr: "README.md is out of date. Run galley write.\n\n" + staleDiff,
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
			"from docs/guide.md (missing)\n    1│+#·Current·guide\n",
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
			"15   │-Current·closing·paragraph.\n     │\\ No newline at end of file\n   15│+Current·closing·paragraph.\n",
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

test("check highlights whitespace in GitHub Actions even when stderr is piped", async () => {
	vi.stubEnv("FORCE_COLOR", undefined)
	vi.stubEnv("GITHUB_ACTIONS", "true")
	const { directory, output } = await fixture({
		"README.mdx": whitespaceDocument,
		"README.md": whitespaceStale,
	})
	await expect(runCli(directory, "check")).rejects.toMatchObject({
		code: 1,
		stdout: "",
		stderr: expect.stringContaining(
			"\u001b[41m\u001b[30m→\u001b[39m\u001b[49m",
		),
	})
	vi.stubEnv("NO_COLOR", "1")
	await expect(runCli(directory, "check")).rejects.toMatchObject({
		code: 1,
		stderr: expect.not.stringContaining("\u001b["),
	})
	expect(await fs.readFile(output, "utf8")).toBe(whitespaceStale)
})
