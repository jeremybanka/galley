import { appendFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { breakage, breakagePrelude } from "breakage"
import configuration from "../breakage.config.ts"

const baseDirname = fileURLToPath(new URL("../", import.meta.url))
const baselineFile = ".breakage/baseline.json"
const baseline = await breakagePrelude({
	tagPattern: configuration.tagPattern,
	baseDirname,
	out: baselineFile,
})
console.log(`Release baseline: ${baseline.ref} (${baseline.commit})`)
const outcome = await breakage({ ...configuration, baseDirname, baselineFile })
let message = outcome.summary
let exitCode = 2
if ("breakingChangesFound" in outcome) {
	if (!outcome.testsFound.some((file) => file.endsWith(".test.ts"))) {
		message =
			"The release contains support files but no public test cases. Compatibility was not established."
	} else {
		exitCode = outcome.breakingChangesFound ? 1 : 0
		if (outcome.breakingChangesFound) console.error(outcome.testResult)
	}
} else if (
	outcome.gitWasClean &&
	outcome.lastReleaseFound &&
	!outcome.testsWereFound &&
	outcome.summary ===
		`No tests were found matching the pattern "${configuration.testPattern}".` &&
	baseline.ref === "refs/tags/galley.md@0.1.4" &&
	baseline.commit === "0c452e60712d811763bae7cae99f898e1455437b"
) {
	// Remove after the first release containing these contracts. No other missing
	// suite, moved tag, dirty checkout, or discovery error qualifies for bootstrap.
	message =
		"BOOTSTRAP ONLY: galley.md@0.1.4 predates the public contracts. Historical compatibility was NOT established. Publish the first contract-bearing release to enable comparison."
	console.log(`::notice title=Compatibility baseline bootstrap::${message}`)
	exitCode = 0
}
console.log(message)
if (process.env.GITHUB_STEP_SUMMARY) {
	await appendFile(
		process.env.GITHUB_STEP_SUMMARY,
		`Baseline: ${baseline.ref} (${baseline.commit})\n\n${message}\n`,
	)
}
process.exitCode = exitCode
