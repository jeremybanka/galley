import fs from "node:fs/promises"
import { isBuiltin } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { compile } from "@mdx-js/mdx"
import { build, type Plugin } from "esbuild"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import type { PluggableList } from "unified"

import { markdownNodes } from "./markdown-nodes.ts"
import { renderMarkdown } from "./runtime.ts"
import type { CompileOptions, Component } from "./types.ts"

export async function compileMarkdown(
	input: string,
	options: CompileOptions = {},
): Promise<string> {
	const inputPath = path.resolve(input)
	const extension = import.meta.url.endsWith(".ts") ? "ts" : "mjs"
	const runtimePath = fileURLToPath(
		new URL(`./jsx-runtime.${extension}`, import.meta.url),
	)
	const indexPath = fileURLToPath(
		new URL(`./index.${extension}`, import.meta.url),
	)
	const skipResolution = Symbol("md-x:resolve")
	const codeImports: Plugin = {
		name: "md-x:code-imports",
		setup(build) {
			build.onResolve({ filter: /.*/ }, async (args) => {
				if (args.pluginData === skipResolution || args.with.type !== "code")
					return undefined
				for (const key of Object.keys(args.with)) {
					if (key !== "type" && key !== "lang")
						throw new Error(`Unknown code import attribute: ${key}`)
				}
				const resolved = await build.resolve(args.path, {
					resolveDir: args.resolveDir,
					kind: args.kind,
					pluginData: skipResolution,
				})
				if (resolved.errors.length) return { errors: resolved.errors }
				if (resolved.external)
					throw new Error(`Cannot read code from external import ${args.path}.`)
				return { path: resolved.path, namespace: "md-x:code" }
			})
			build.onLoad({ filter: /.*/, namespace: "md-x:code" }, async (args) => {
				const source = await fs.readFile(args.path, "utf8")
				const lang = args.with.lang ?? path.extname(args.path).slice(1)
				if (/[\r\n`]/.test(lang))
					throw new Error(
						"Code languages cannot contain newlines or backticks.",
					)
				return {
					contents: `export default function Code() { return ${JSON.stringify({ type: "code", lang, value: source })} }`,
					loader: "js",
					watchFiles: [args.path],
				}
			})
		},
	}
	const documents: Plugin = {
		name: "md-x:documents",
		setup(build) {
			build.onLoad({ filter: /\.mdx?$/ }, async (args) => {
				if (Object.keys(args.with).length > 0) return undefined
				const remarkPlugins: PluggableList = [remarkGfm, markdownNodes]
				if (args.path.endsWith(".mdx"))
					remarkPlugins.unshift([
						remarkMdx,
						{ acornOptions: { ecmaVersion: 2025 } },
					])
				return {
					contents: String(
						await compile(
							{ path: args.path, value: await fs.readFile(args.path, "utf8") },
							{
								format: args.path.endsWith(".mdx") ? "mdx" : "md",
								jsx: true,
								jsxImportSource: "md-x",
								remarkPlugins,
							},
						),
					),
					loader: "jsx",
					resolveDir: path.dirname(args.path),
				}
			})
		},
	}
	const packages: Plugin = {
		name: "md-x:packages",
		setup(build) {
			build.onResolve({ filter: /.*/ }, async (args) => {
				if (args.pluginData === skipResolution) return undefined
				if (
					args.path === "md-x/jsx-runtime" ||
					args.path === "md-x/jsx-dev-runtime"
				) {
					return { path: pathToFileURL(runtimePath).href, external: true }
				}
				if (args.path === "md-x")
					return { path: pathToFileURL(indexPath).href, external: true }
				if (Object.keys(args.with).length > 0) return undefined
				if (
					isBuiltin(args.path) ||
					path.isAbsolute(args.path) ||
					args.path.startsWith(".")
				)
					return undefined
				const resolved = await build.resolve(args.path, {
					resolveDir: args.resolveDir,
					kind: args.kind,
					pluginData: skipResolution,
				})
				if (resolved.errors.length) return { errors: resolved.errors }
				return {
					path: resolved.external
						? resolved.path
						: pathToFileURL(resolved.path).href,
					external: true,
				}
			})
		},
	}
	const result = await build({
		entryPoints: [inputPath],
		bundle: true,
		platform: "node",
		format: "esm",
		jsx: "automatic",
		jsxImportSource: "md-x",
		write: false,
		logLevel: "silent",
		target: "es2022",
		plugins: [...(options.plugins ?? []), codeImports, documents, packages],
	})
	const output = result.outputFiles[0]
	if (!output) throw new Error("The Markdown document did not compile.")
	// A fresh URL ensures write/check evaluates local component changes each time.
	const url = `data:text/javascript;base64,${Buffer.from(output.contents).toString("base64")}#${crypto.randomUUID()}`
	const document = (await import(url)) as { default?: Component }
	if (typeof document.default !== "function")
		throw new Error(`${inputPath} must export a document component.`)
	return renderMarkdown(
		{ kind: "md-x:element", type: document.default, props: {} },
		{ path: inputPath, directory: path.dirname(inputPath) },
	)
}
