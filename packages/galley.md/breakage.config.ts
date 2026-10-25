import { defineConfig, semverPolicy } from "breakage"
import { changesetsReleaseDelta } from "breakage/changesets"

export default defineConfig({
	tagPattern: "refs/tags/galley\\.md@",
	testPattern: "__tests__/{public,fixtures/public}/**/*",
	test: "pnpm run test:public",
	release: {
		resolveDelta: changesetsReleaseDelta(),
		policy: semverPolicy({ beforeV1: "minor" }),
	},
})
