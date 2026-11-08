import type { KnipConfig } from "knip"

// Public source entrypoints remain roots, including CLIs, workers, and conditional exports.
// Formatter plugins and JSON schemas are loaded by configuration paths, not imports.
// Generated distributions are checked through their authored source entrypoints.
export default {
	workspaces: {
		".": {
			entry: ["scripts/*.{ts,tsx}"],
			project: ["*.ts", "scripts/**/*.{ts,tsx}"],
			ignoreDependencies: [
				"@dprint/json",
				"@dprint/markdown",
				"@dprint/oxc",
				"@dprint/toml",
				"dprint-plugin-malva",
			],
		},
		"packages/galley.md": {
			entry: [
				"src/index.ts!",
				"src/cli.ts!",
				"src/jsx-runtime.ts!",
				"src/mapper/server.ts!",
				"src/mapper/transform.ts!",
				"src/lsp/server.ts!",
				"src/editor/preview-worker.ts!",
				"src/vscode/extension.ts!",
				"breakage.config.ts",
				"__tests__/fixtures/**/*.{ts,tsx,js,mjs,cjs}",
			],
			project: [
				"*.ts",
				"{src,bin}/**/*.{ts,tsx}!",
				"{tests,__tests__,peer-environments,examples}/**/*.{ts,tsx,js,mjs,cjs}",
			],
			ignoreDependencies: [
				// Provided by the VS Code extension host.
				"vscode",
			],
		},
		"packages/dprint-plugin-mdx": {
			entry: [
				"tests/**/fixtures/**/*.{ts,tsx,js,mjs,cjs}",
				"__tests__/fixtures/**/*.{ts,tsx,js,mjs,cjs}",
			],
			project: [
				"*.ts",
				"{src,bin}/**/*.{ts,tsx}!",
				"{tests,__tests__,peer-environments,examples}/**/*.{ts,tsx,js,mjs,cjs}",
			],
		},
	},
	// mise is installed by the repository setup action.
	ignoreBinaries: ["mise"],
	ignore: ["**/dist/**"],
} satisfies KnipConfig
