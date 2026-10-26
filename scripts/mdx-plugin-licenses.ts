// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process"
import {
	cpSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

type Package = {
	name: string
	version: string
	manifest_path: string
	license: string | null
	license_file: string | null
	repository: string | null
	source: string | null
}

/** Preserve notices from the locked crates, including build and test dependencies. */
export function writeDependencyNotices(root: string, directory: string): void {
	const metadata = JSON.parse(
		execFileSync(
			"mise",
			[
				"exec",
				"--",
				"cargo",
				"metadata",
				"--locked",
				"--format-version",
				"1",
				"--filter-platform",
				"wasm32-unknown-unknown",
			],
			{ cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
		),
	) as { packages: Package[] }
	const notices: string[] = []
	for (const dependency of metadata.packages
		.filter((item) => item.source !== null)
		.sort((a, b) => a.name.localeCompare(b.name))) {
		const source = dirname(dependency.manifest_path)
		const files = readdirSync(source, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isFile() &&
					/^(license|copying|copyright|notice)([._-]|$)/i.test(entry.name),
			)
			.map((entry) => join(source, entry.name))
			.sort()
		if (dependency.license_file)
			files.push(join(source, dependency.license_file))
		if (!files.length) {
			// These crates omit their repository license files from the crate archive.
			const supplemental: Record<string, string> = {
				capacity_builder_macros: "CAPACITY-BUILDER-MIT",
				deno_error_macro: "DENO-ERROR-MIT",
				"dprint-swc-ext": "DPRINT-SWC-EXT-MIT",
			}
			if (supplemental[dependency.name]) {
				files.push(join(directory, "licenses", supplemental[dependency.name]!))
			} else if (
				dependency.repository?.startsWith("https://github.com/swc-project/swc")
			) {
				files.push(join(directory, "licenses/SWC-APACHE"))
			} else if (
				dependency.repository?.startsWith("https://github.com/dudykr/ddbase")
			) {
				files.push(join(directory, "licenses/DDBASE-APACHE"))
			} else if (dependency.repository === "https://github.com/Nugine/simd") {
				files.push(join(directory, "licenses/NUGINE-MIT"))
			} else if (
				dependency.name === "smartstring" &&
				dependency.license === "MPL-2.0+"
			) {
				files.push(join(directory, "LICENSE"))
			} else {
				throw new Error(
					`Missing license text for ${dependency.name}@${dependency.version}`,
				)
			}
		}
		notices.push(
			`${dependency.name} ${dependency.version}\n${dependency.license}\n${dependency.repository ?? ""}\n\n${[...new Set(files)].map((file) => readFileSync(file, "utf8")).join("\n")}\n`,
		)
		if (dependency.license?.includes("MPL")) {
			const destination = join(
				directory,
				"source/dependencies",
				`${dependency.name}-${dependency.version}`,
			)
			mkdirSync(dirname(destination), { recursive: true })
			cpSync(source, destination, { recursive: true })
		}
	}
	const file = join(directory, "DEPENDENCY_NOTICES.txt")
	const text = notices.join(
		"\n------------------------------------------------------------\n\n",
	)
	// Avoid rebuilding the WASM module when the locked dependency notices are unchanged.
	let previous = ""
	try {
		previous = readFileSync(file, "utf8")
	} catch {
		/* First build. */
	}
	if (previous !== text) writeFileSync(file, text)
}
