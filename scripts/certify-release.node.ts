import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { BreakageBaseline } from "breakage"
import { getReleasePlan } from "@changesets/get-release-plan"

const directory = fileURLToPath(new URL("../", import.meta.url))
const readJson = async (name: string) =>
	JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"))
const baseline = (await readJson(
	"../.breakage/baseline.json",
)) as BreakageBaseline
const manifestPath = "packages/galley.md/package.json"
const previous = JSON.parse(
	execFileSync("git", ["show", `${baseline.commit}:${manifestPath}`], {
		cwd: directory,
		encoding: "utf8",
	}),
) as { name: string; version: string }
const current = (await readJson(`../${manifestPath}`)) as typeof previous
if (previous.name !== current.name)
	throw new Error("Release package names differ.")

// Certification depends on crossing a major/minor boundary, not patch or
// prerelease identifiers. Compare against the exact release used for replay.
function boundary(version: string) {
	const match = /^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/.exec(version)
	if (!match) throw new Error(`Invalid release version: ${version}`)
	return { major: Number(match[1]), minor: Number(match[2]) }
}
const before = boundary(previous.version)
function permitsBreaking(version: string) {
	const after = boundary(version)
	return (
		after.major > before.major ||
		(before.major === 0 && after.major === 0 && after.minor > before.minor)
	)
}

let version = current.version
if (!permitsBreaking(version)) {
	// Use Changesets' assembled plan rather than matching changeset prose.
	// A versioned breaking manifest needs no pending changeset to certify it.
	const plan = await getReleasePlan(directory)
	version =
		plan.releases.find(({ name }) => name === current.name)?.newVersion ??
		version
}
const certified = permitsBreaking(version)
console.log(
	`Release ${previous.version} → ${version}: ${certified ? "certifies" : "does not certify"} a failed contract check.`,
)
process.exitCode = certified ? 0 : 1
