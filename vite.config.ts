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
			dts: { entry: ["src/index.ts", "src/jsx-runtime.ts"], sourcemap: true },
			entry: {
				cli: "src/cli.ts",
				index: "src/index.ts",
				"jsx-runtime": "src/jsx-runtime.ts",
			},
			format: "esm",
			outDir: "dist",
			sourcemap: true,
		},
	],
	test: { include: ["__tests__/**/*.test.ts"] },
})
