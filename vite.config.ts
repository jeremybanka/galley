import { defineConfig } from "vite-plus"

export default defineConfig({
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
