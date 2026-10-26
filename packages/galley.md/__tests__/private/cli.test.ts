import fs from "node:fs/promises"
import { expect, test } from "vite-plus/test"
import { fixture, runCli } from "../public/support.ts"
import invalidDocument from "#fixtures/compiler/invalid/element.mdx" with { type: "text" }

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
