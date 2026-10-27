// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { writeDependencyNotices } from "./mdx-plugin-licenses.ts"

const root = fileURLToPath(new URL("..", import.meta.url))
const directory = join(root, "packages/dprint-plugin-mdx")
const manifest = JSON.parse(
	readFileSync(join(directory, "package.json"), "utf8"),
) as {
	name: string
	version: string
}

writeDependencyNotices(root, directory)

execFileSync(
	"mise",
	[
		"exec",
		"--",
		"cargo",
		"build",
		"--locked",
		"--release",
		"--target",
		"wasm32-unknown-unknown",
		"--features",
		"wasm",
		"-p",
		"dprint-plugin-galley-mdx",
	],
	{ cwd: root, stdio: "inherit" },
)

const input = join(
	root,
	"target/wasm32-unknown-unknown/release/dprint_plugin_galley_mdx.wasm",
)
const output = join(directory, "plugin.wasm")
const bytes = readFileSync(input)
copyFileSync(input, output)
chmodSync(output, 0o644)
writeFileSync(
	join(directory, "manifest.json"),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			name: manifest.name,
			version: manifest.version,
			size: bytes.byteLength,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		},
		null,
		"\t",
	)}\n`,
)

// Include the locked workspace recipe with the source distributed under MPL.
const source = join(directory, "source")
mkdirSync(source, { recursive: true })
for (const file of ["Cargo.toml", "Cargo.lock", "mise.toml", "rustfmt.toml"]) {
	copyFileSync(join(root, file), join(source, file))
}
