import type { BreakageOptions } from "breakage"

export default {
	tagPattern: "refs/tags/galley\\.md@",
	testPattern: "packages/galley.md/__tests__/{public,fixtures/public}/**/*",
	testCommand: "pnpm run test:public",
	// Breakage 0.8.5's shell hook cannot distinguish regressions from setup errors.
	// Fail closed until adopting its typed release model in a future upgrade.
	certifyCommand: "false",
} satisfies BreakageOptions
