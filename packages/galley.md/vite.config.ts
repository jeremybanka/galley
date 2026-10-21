import { fileURLToPath } from "node:url"
import { defineConfig } from "vite-plus"

export default defineConfig({
	pack: [
		{
			clean: true,
			deps: {
				neverBundle: true,
				onlyBundle: [],
				dts: { neverBundle: [/^[\w@]/] },
			},
			dts: {
				// Vite Plus 1.0 auto-detects only TypeScript 7.0. Select 7.1 explicitly.
				generator: "tsgo",
				tsgo: {
					path: fileURLToPath(
						new URL(
							"./bin/tsc",
							import.meta.resolve("typescript/package.json"),
						),
					),
				},
				entry: [
					"src/index.ts",
					"src/jsx-runtime.ts",
					"src/mapper/transform.ts",
				],
				sourcemap: true,
			},
			entry: {
				cli: "src/cli.ts",
				index: "src/index.ts",
				"jsx-runtime": "src/jsx-runtime.ts",
				"content-mapper": "src/mapper/server.ts",
				mapper: "src/mapper/transform.ts",
				lsp: "src/lsp/server.ts",
				"preview-worker": "src/editor/preview-worker.ts",
			},
			format: "esm",
			outDir: "dist",
			sourcemap: true,
		},
	],
	test: { include: ["__tests__/**/*.test.ts"] },
})
