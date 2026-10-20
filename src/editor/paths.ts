import path from "node:path"
import { fileURLToPath } from "node:url"

export function packageRoot(url = import.meta.url): string {
	return fileURLToPath(new URL(url.endsWith(".ts") ? "../../" : "../", url))
}

export function runtimeEntry(
	name: string,
	source: string,
	url = import.meta.url,
): string {
	const root = packageRoot(url)
	return path.join(
		root,
		url.endsWith(".ts") ? `src/${source}.ts` : `dist/${name}.mjs`,
	)
}
