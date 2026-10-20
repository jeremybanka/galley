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
