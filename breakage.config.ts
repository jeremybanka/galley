import type { BreakageOptions } from "breakage"

export default {
	tagPattern: "refs/tags/galley\\.md@",
	testPattern: "packages/galley.md/__tests__/{public,fixtures/public}/**/*",
	testCommand: "pnpm run test:public",
	certifyCommand: "node scripts/certify-release.node.ts",
} satisfies BreakageOptions
