import fs from "node:fs/promises"
import path from "node:path"

import { compileMarkdown } from "./compile.ts"
import { frontmatterOutput } from "./frontmatter.ts"
import type { RunOptions, RunResult } from "./types.ts"

export async function runGalley(
	input: string,
	options: RunOptions,
): Promise<RunResult> {
	const inputPath = path.resolve(input)
	const outputPath =
		options.output !== undefined
			? path.resolve(options.output)
			: await documentOutput(inputPath)
	if (inputPath === outputPath)
		throw new Error("The Markdown output must differ from the source document.")
	const sourcePath = await fs.realpath(inputPath)
	let destinationPath: string | undefined
	try {
		destinationPath = await fs.realpath(outputPath)
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error
	}
	if (sourcePath === destinationPath)
		throw new Error("The Markdown output must differ from the source document.")
	const markdown = await compileMarkdown(inputPath, options)
	let previous: string | undefined
	try {
		previous = await fs.readFile(outputPath, "utf8")
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error
	}
	const changed = previous !== markdown
	if (changed && options.mode === "write") {
		await fs.mkdir(path.dirname(outputPath), { recursive: true })
		await fs.writeFile(outputPath, markdown)
	}
	return { changed, markdown, outputPath }
}

async function documentOutput(inputPath: string): Promise<string> {
	const output = frontmatterOutput(
		await fs.readFile(inputPath, "utf8"),
		inputPath,
	)
	if (output === undefined) return inputPath.replace(/\.mdx?$/i, ".md")
	const directory = path.dirname(inputPath)
	if (!output.startsWith("/")) {
		if (path.win32.isAbsolute(output))
			throw new Error(
				"Frontmatter galley.output uses / for repository-root paths.",
			)
		return path.resolve(directory, output)
	}
	const root = await repositoryRoot(directory)
	const destination = path.resolve(root, `.${output}`)
	const relative = path.relative(root, destination)
	if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`))
		throw new Error(
			"Frontmatter galley.output must name a file inside the repository.",
		)
	return destination
}

async function repositoryRoot(directory: string): Promise<string> {
	for (let current = directory; ; current = path.dirname(current)) {
		try {
			const marker = await fs.stat(path.join(current, ".git"))
			// Git worktrees and submodules use a file instead of a directory.
			if (marker.isDirectory() || marker.isFile()) return current
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				throw error
		}
		if (path.dirname(current) === current)
			throw new Error(
				`Cannot resolve repository-root galley.output: no .git directory or file above ${directory}.`,
			)
	}
}
