import fs from "node:fs/promises"
import path from "node:path"

import { compileMarkdown } from "./compile.ts"
import type { RunOptions, RunResult } from "./types.ts"

export async function runMdX(
	input: string,
	options: RunOptions,
): Promise<RunResult> {
	const inputPath = path.resolve(input)
	const outputPath = path.resolve(
		options.output ?? inputPath.replace(/\.mdx?$/i, ".md"),
	)
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
	if (changed && options.mode === "write")
		await fs.writeFile(outputPath, markdown)
	return { changed, markdown, outputPath }
}
