import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { afterEach } from "vite-plus/test"

const directories: string[] = []
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	)
})

export async function fixture(files: Record<string, string>) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "galley-contract-"))
	directories.push(directory)
	for (const [name, contents] of Object.entries(files)) {
		const filename = path.join(directory, name)
		await fs.mkdir(path.dirname(filename), { recursive: true })
		await fs.writeFile(filename, contents)
	}
	return {
		directory,
		input: path.join(directory, "README.mdx"),
		output: path.join(directory, "README.md"),
	}
}

// Observe emitted Markdown independently of Galley's exported Markdown helper.
// Source offsets and list formatting are not compatibility commitments.
function structure(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, child: unknown) =>
			key === "position" || key === "spread" ? undefined : child,
		),
	)
}

export function parseMarkdown(markdown: string): Root {
	return structure(
		unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkFrontmatter, ["yaml"])
			.parse(markdown),
	) as Root
}

export function runCli(directory: string, ...args: string[]) {
	const cli = process.env.GALLEY_TEST_CLI
	if (!cli)
		throw new Error("The current runner must select Galley's CLI entrypoint.")
	return promisify(execFile)(process.execPath, [cli, ...args], {
		cwd: directory,
	})
}
