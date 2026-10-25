import { appendFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { breakage, breakagePrelude, loadConfig } from "breakage"

const configuration = await loadConfig(
	fileURLToPath(new URL("../breakage.config.ts", import.meta.url)),
)
const { baseDirname, testPattern } = configuration
if (!baseDirname || !testPattern)
	throw new Error("Breakage requires a base directory and test pattern.")
const baselineFile = ".breakage/baseline.json"
const baseline = await breakagePrelude({
	tagPattern: configuration.tagPattern,
	baseDirname,
	out: baselineFile,
})
console.log(`Release baseline: ${baseline.ref} (${baseline.commit})`)
const outcome = await breakage({
	...configuration,
	baseDirname,
	testPattern,
	baselineFile,
})
let message = outcome.summary
let exitCode = 2
if ("setupError" in outcome) console.error(outcome.setupError)
if ("breakingChangesFound" in outcome) {
	if (!outcome.testsFound.some((file) => file.endsWith(".test.ts"))) {
		message =
			"The release contains support files but no public test cases. Compatibility was not established."
	} else {
		exitCode =
			outcome.breakingChangesFound && !outcome.release?.breaking ? 1 : 0
		if (outcome.breakingChangesFound) console.error(outcome.testResult)
	}
} else if (
	outcome.gitWasClean &&
	"lastReleaseFound" in outcome &&
	outcome.lastReleaseFound &&
	!outcome.testsWereFound &&
	outcome.summary ===
		`No tests were found matching the pattern "${configuration.testPattern}".` &&
	baseline.ref === "refs/tags/galley.md@0.1.5" &&
	baseline.commit === "347090b27913997a9f032cc4aeb6184b1c4cbb98"
) {
	// Remove after the first release containing these contracts. No other missing
	// suite, moved tag, dirty checkout, or discovery error qualifies for bootstrap.
	message =
		"BOOTSTRAP ONLY: galley.md@0.1.5 predates the public contracts. Historical compatibility was NOT established. Publish the first contract-bearing release to enable comparison."
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
