import { defineConfig } from "vite-plus"
import { textFixtures } from "../galley.md/__tests__/public/text-fixtures.ts"

export default defineConfig({
	plugins: [textFixtures()],
	test: { include: ["__tests__/*.test.ts"] },
})
