#!/usr/bin/env node

import path from "node:path"

import {
	cli,
	completionResponse,
	help,
	helpOption,
	logWarnings,
	optional,
} from "comline"

import { runGalley } from "./run.ts"

const manual = helpOption("Show help for the galley command line.")
const command = cli({
	cliName: "galley",
	cliDescription:
		"Compile MDX components and source imports into plain Markdown.",
	routes: optional({
		write: optional({ $input: optional({ $output: null }) }),
		check: optional({ $input: optional({ $output: null }) }),
		vsix: optional({ build: optional({ $outdir: null }), $editor: null }),
		lsp: null,
	}),
	routeOptions: {
		"": manual,
		write: manual,
		"write/$input": manual,
		"write/$input/$output": manual,
		check: manual,
		"check/$input": manual,
		"check/$input/$output": manual,
		vsix: manual,
		"vsix/$editor": manual,
		"vsix/build": manual,
		"vsix/build/$outdir": manual,
		lsp: manual,
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
	if (inputs.case === "" || inputs.opts.help) {
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
