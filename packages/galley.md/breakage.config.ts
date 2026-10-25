import type { BreakageOptions } from "breakage"

// The workspace runner executes these commands and restore paths from the Git root.
export default {
	tagPattern: "refs/tags/galley\\.md@",
	testPattern: "packages/galley.md/__tests__/{public,fixtures/public}/**/*",
	testCommand: "pnpm run test:public",
	certifyCommand: "node scripts/certify-release.node.ts",
} satisfies BreakageOptions
