#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

import {
	cli,
	completionResponse,
	help,
	helpOption,
	logWarnings,
	noOptions,
	optional,
} from "comline"

import { diffColors, formatCheckDiff } from "./check-diff.ts"
import { runGalley } from "./run.ts"

const manuals = {
	root: helpOption("Show help for the galley command line."),
	help: noOptions("Show help for the galley command line."),
	write: noOptions("Compile MDX and write Markdown."),
	check: noOptions("Check whether Markdown is up to date."),
	vsix: noOptions("Build and install the editor extension."),
	build: noOptions("Build the editor extension without installing it."),
	lsp: noOptions("Start the language server."),
}
const command = cli({
	cliName: "galley",
	cliDescription:
		"Compile MDX components and source imports into plain Markdown.",
	routes: optional({
		help: null,
		write: optional({ $input: optional({ $output: null }) }),
		check: optional({ $input: optional({ $output: null }) }),
		vsix: optional({ build: optional({ $outdir: null }), $editor: null }),
		lsp: null,
	}),
	routeOptions: {
		"": manuals.root,
		help: manuals.help,
		write: manuals.write,
		"write/$input": manuals.write,
		"write/$input/$output": manuals.write,
		check: manuals.check,
		"check/$input": manuals.check,
		"check/$input/$output": manuals.check,
		vsix: manuals.vsix,
		"vsix/$editor": manuals.vsix,
		"vsix/build": manuals.build,
		"vsix/build/$outdir": manuals.build,
		lsp: manuals.lsp,
	},
	discoverConfigPath: () => undefined,
})

async function main() {
	const completion = await completionResponse(command.definition, process.argv)
	if (completion !== undefined) {
		process.stdout.write(completion)
		return
	}
	const { inputs, warnings } = command(process.argv)
	logWarnings(warnings)
	if (inputs.case === "" || inputs.case === "help") {
		process.stdout.write(help(command.definition))
		return
	}
	if (inputs.path[0] === "lsp") {
		await import("./lsp/server.ts")
		return
	}
	if (inputs.path[0] === "vsix") {
		const { buildVsix, installVsix } = await import("./editor/vsix.ts")
		const buildOnly = inputs.path[1] === "build"
		const directory = path.resolve(
			buildOnly ? (inputs.path[2] ?? "artifacts") : "artifacts",
		)
		const file = await buildVsix(directory)
		process.stdout.write(`Built ${file}.\n`)
		if (!buildOnly) await installVsix(file, inputs.path[1] ?? "code")
		return
	}
	const mode = inputs.path[0] === "write" ? "write" : "check"
	const input = inputs.path[1] ?? "README.mdx"
	const output = inputs.path[2]
	const result = await runGalley(input, {
		mode,
		...(output === undefined ? {} : { output }),
	})
	const relative = path.relative(process.cwd(), result.outputPath)
	if (mode === "check" && result.changed) {
		process.stderr.write(`${relative} is out of date. Run galley write.\n`)
		let previous: string | undefined
		try {
			previous = await fs.readFile(result.outputPath, "utf8")
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				throw error
		}
		process.stderr.write(
			formatCheckDiff(
				relative,
				previous,
				result.markdown,
				diffColors(process.env, process.stderr.isTTY === true),
			),
		)
		process.exitCode = 1
	} else
		process.stdout.write(
			result.changed
				? `Updated ${relative}.\n`
				: `${relative} is already up to date.\n`,
		)
}

main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	)
	process.exitCode = 1
})
