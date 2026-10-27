import { fileURLToPath } from "node:url"
import { defineConfig } from "vite-plus"
import { textFixtures } from "./__tests__/public/text-fixtures.ts"

export default defineConfig({
	plugins: [textFixtures()],
	resolve: {
		alias: [
			{
				find: /^galley\.md$/,
				replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
			},
		],
	},
	pack: [
		{
			clean: true,
			deps: {
				// tsdown <0.23 compatibility: resolve external dependency subpaths.
				// Remove to preserve subpath imports as written (the new default).
				// https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
				resolveDepSubpath: true,
				neverBundle: true,
				onlyBundle: [],
				dts: { neverBundle: [/^[\w@]/] },
			},
			dts: {
				// Declarations contain only TS; packaging must not execute the mapper it is building.
				tsconfig: "tsconfig.build.json",
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
	test: {
		include: ["__tests__/{private,public}/**/*.test.ts"],
		env: {
			GALLEY_TEST_CLI: fileURLToPath(new URL("./src/cli.ts", import.meta.url)),
		},
	},
})
