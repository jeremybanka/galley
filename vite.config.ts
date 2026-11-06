import { defineConfig } from "vite-plus"

export default defineConfig({
	fmt: {
		overrides: [{ files: ["**/*.{yml,yaml}"], options: { singleQuote: true } }],
	},
	lint: {
		ignorePatterns: [
			"**/dist/**",
			"**/node_modules/**",
			"**/__tests__/fixtures/**",
		],
		options: { typeAware: true, typeCheck: true },
	},
	staged: { "*": ["dprint fmt", "vp check --no-fmt --fix"] },
})
