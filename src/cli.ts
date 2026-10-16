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

import { runMdX } from "./run.ts"

const manual = helpOption("Show help for the md-x command line.")
const command = cli({
	cliName: "md-x",
	cliDescription:
		"Compile MDX components and source imports into plain Markdown.",
	routes: optional({
		write: optional({ $input: optional({ $output: null }) }),
		check: optional({ $input: optional({ $output: null }) }),
	}),
	routeOptions: {
		"": manual,
		write: manual,
		"write/$input": manual,
		"write/$input/$output": manual,
		check: manual,
		"check/$input": manual,
		"check/$input/$output": manual,
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
	const mode = inputs.path[0] === "write" ? "write" : "check"
	const input = inputs.path[1] ?? "README.mdx"
	const output = inputs.path[2]
	const result = await runMdX(input, {
		mode,
		...(output === undefined ? {} : { output }),
	})
	const relative = path.relative(process.cwd(), result.outputPath)
	if (mode === "check" && result.changed) {
		process.stderr.write(`${relative} is out of date. Run md-x write.\n`)
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
