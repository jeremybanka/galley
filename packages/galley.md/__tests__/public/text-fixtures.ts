import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import type { Plugin } from "vite-plus"

const directory = fileURLToPath(new URL("../fixtures/", import.meta.url))

/** Resolve attributes before Vite's development import analysis drops them. */
export function textFixtures(): Plugin {
	return {
		name: "galley-test-text",
		enforce: "pre",
		async transform(source, id) {
			if (
				!id.includes("/__tests__/") ||
				!id.endsWith(".ts") ||
				!source.includes("#fixtures/")
			)
				return
			const result = await build({
				absWorkingDir: path.dirname(id),
				stdin: {
					contents: source,
					loader: "ts",
					sourcefile: id,
					resolveDir: path.dirname(id),
				},
				bundle: true,
				platform: "node",
				format: "esm",
				write: false,
				outfile: "fixture-imports.js",
				sourcemap: "external",
				logLevel: "silent",
				plugins: [
					{
						name: "text-fixtures",
						setup: (build) => {
							build.onResolve({ filter: /.*/ }, (args) => {
								if (!args.path.startsWith("#fixtures/"))
									return { path: args.path, external: true }
								if (
									args.with.type !== "text" ||
									Object.keys(args.with).length !== 1
								)
									throw new Error(
										'Fixture imports require with { type: "text" }.',
									)
								return {
									path: path.resolve(
										directory,
										args.path.slice("#fixtures/".length),
									),
									namespace: "fixture-text",
								}
							})
							build.onLoad(
								{ filter: /.*/, namespace: "fixture-text" },
								async (args) => {
									this.addWatchFile(args.path)
									return {
										contents: await fs.readFile(args.path, "utf8"),
										loader: "text",
									}
								},
							)
						},
					},
				],
			})
			const code = result.outputFiles.find((file) => file.path.endsWith(".js"))
			const map = result.outputFiles.find((file) => file.path.endsWith(".map"))
			if (!code || !map) this.error("Fixture imports did not compile.")
			return { code: code.text, map: map.text }
		},
	}
}
