import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { build } from "esbuild"
import type { Metafile } from "esbuild"
import { packageRoot } from "./paths.ts"

async function thirdPartyNotices(metafiles: Metafile[]): Promise<string> {
	const packages = new Map<string, string>()
	for (const file of metafiles.flatMap((metafile) =>
		Object.keys(metafile.inputs),
	)) {
		let directory = path.dirname(path.resolve(file))
		while (directory !== path.dirname(directory)) {
			if (packages.has(directory)) break
			let manifest: { name: string; version: string }
			try {
				manifest = JSON.parse(
					await readFile(path.join(directory, "package.json"), "utf8"),
				) as typeof manifest
			} catch {
				directory = path.dirname(directory)
				continue
			}
			const notices: string[] = []
			for (const name of [
				"LICENSE",
				"LICENSE.md",
				"LICENSE.txt",
				"license",
				"license.md",
				"license.txt",
				"NOTICE",
				"NOTICE.txt",
			]) {
				try {
					notices.push(await readFile(path.join(directory, name), "utf8"))
				} catch {
					/* This package uses another license filename. */
				}
			}
			packages.set(
				directory,
				manifest.name === "galley.md"
					? ""
					: `## ${manifest.name} ${manifest.version}\n\n${notices.join("\n\n")}`,
			)
			break
		}
	}
	return `# Third-party notices\n\n${[...packages.values()].filter(Boolean).sort().join("\n\n")}\n`
}

/** Copy the installed platform's native runtime packages into the VSIX. */
async function copyRuntimeDependencies(destination: string) {
	const visited = new Set<string>()
	async function copy(
		name: string,
		require = createRequire(import.meta.url),
		optional = false,
	): Promise<void> {
		let manifestPath
		try {
			manifestPath = require.resolve(`${name}/package.json`)
		} catch (error) {
			if (optional) return
			throw error
		}
		if (visited.has(name)) return
		visited.add(name)
		const root = path.dirname(manifestPath)
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
			dependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		await cp(root, path.join(destination, name), {
			recursive: true,
			dereference: true,
		})
		const fromPackage = createRequire(manifestPath)
		for (const dependency of Object.keys(manifest.dependencies ?? {}))
			await copy(dependency, fromPackage)
		for (const dependency of Object.keys(manifest.optionalDependencies ?? {}))
			await copy(dependency, fromPackage, true)
	}
	await copy("typescript")
	await copy("esbuild")
	await copy("@dprint/markdown")
}

export async function buildVsix(
	outdir: string,
	root = packageRoot(),
): Promise<string> {
	await mkdir(outdir, { recursive: true })
	const staging = await mkdtemp(path.join(outdir, ".galley-vsix-"))
	try {
		const { version } = JSON.parse(
			await readFile(path.join(root, "package.json"), "utf8"),
		) as { version: string }
		const manifest = JSON.parse(
			await readFile(path.join(root, "src/vscode/package.json"), "utf8"),
		) as { version: string }
		manifest.version = version
		await writeFile(
			path.join(staging, "package.json"),
			JSON.stringify(manifest, null, 2),
		)
		for (const file of [
			"README.md",
			"language-configuration.json",
			"galley.tmLanguage.json",
		])
			await cp(path.join(root, "src/vscode", file), path.join(staging, file))
		await cp(path.join(root, "LICENSE"), path.join(staging, "LICENSE"))
		const extension = await build({
			entryPoints: { extension: path.join(root, "src/vscode/extension.ts") },
			outdir: path.join(staging, "dist"),
			outExtension: { ".js": ".cjs" },
			bundle: true,
			platform: "node",
			format: "cjs",
			external: ["vscode"],
			target: "node22",
			metafile: true,
		})
		const runtime = await build({
			entryPoints: Object.fromEntries(
				[
					["lsp", "lsp/server"],
					["content-mapper", "mapper/server"],
					["preview-worker", "editor/preview-worker"],
					["index", "index"],
					["jsx-runtime", "jsx-runtime"],
				].map(([name, file]) => [name, path.join(root, `src/${file}.ts`)]),
			),
			outdir: path.join(staging, "dist"),
			outExtension: { ".js": ".mjs" },
			bundle: true,
			splitting: true,
			platform: "node",
			format: "esm",
			external: ["esbuild", "typescript", "@dprint/markdown"],
			target: "node22",
			metafile: true,
			banner: {
				js: 'import { createRequire as __mdxCreateRequire } from "node:module"; const require = __mdxCreateRequire(import.meta.url);',
			},
		})
		await writeFile(
			path.join(staging, "THIRD_PARTY_NOTICES.md"),
			await thirdPartyNotices([extension.metafile!, runtime.metafile!]),
		)
		await copyRuntimeDependencies(path.join(staging, "dist/node_modules"))
		const { createVSIX } = await import("@vscode/vsce")
		const destination = path.resolve(outdir, `galley-${version}.vsix`)
		await createVSIX({
			cwd: staging,
			packagePath: destination,
			dependencies: false,
			target: `${process.platform}-${process.arch}`,
		})
		return destination
	} finally {
		await rm(staging, { recursive: true, force: true })
	}
}

export async function installVsix(
	file: string,
	editor = "code",
): Promise<void> {
	const child = spawn(editor, ["--install-extension", file, "--force"], {
		stdio: "inherit",
	})
	const code = await new Promise<number | null>((resolve, reject) => {
		child.once("error", reject)
		child.once("exit", resolve)
	})
	if (code !== 0) throw new Error(`${editor} exited with code ${code}.`)
}
