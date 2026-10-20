import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { documentImports, importAttributes } from "../editor/document.ts"
import { builtinImportTypes } from "../mapper/transform.ts"

export function attributedImports(source: string) {
	try {
		return documentImports(source).filter((item) => item.attributes?.length)
	} catch {
		return []
	}
}

/** Work on incomplete attribute objects too, before a strict parser can finish. */
export function attributeCompletions(source: string, offset: number) {
	const prefix = source.slice(0, offset)
	const match = /\bwith\s*\{([^{}]*)$/.exec(prefix)
	if (!match) return undefined
	const attributes = match[1] ?? ""
	if (/\btype\s*:\s*["'][^"']*$/.test(attributes))
		return builtinImportTypes.map(({ type }) => ({ label: type, kind: 12 }))
	if (/\blang\s*:\s*["'][^"']*$/.test(attributes))
		return ["ts", "tsx", "js", "jsx", "json", "bash", "text", "md"].map(
			(label) => ({ label, kind: 12 }),
		)
	const type = /\btype\s*:\s*["']([^"']*)["']/.exec(attributes)?.[1]
	const keys = ["type", ...(type === "code" ? ["lang"] : [])]
	return keys
		.filter((key) => !new RegExp(`\\b${key}\\s*:`).test(attributes))
		.map((key) => ({
			label: key,
			kind: 10,
			insertText: `${key}: "$1"`,
			insertTextFormat: 2,
		}))
}

export async function importDefinition(
	uri: string,
	source: string,
	offset: number,
) {
	const statement = attributedImports(source).find(
		(item) =>
			(offset >= item.source.start && offset <= item.source.end) ||
			item.specifiers.some(
				({ local }) => offset >= local.start && offset <= local.end,
			),
	)
	if (!statement) return undefined
	if (
		!statement.source.value.startsWith(".") &&
		!path.isAbsolute(statement.source.value)
	)
		return undefined
	const file = path.resolve(
		path.dirname(fileURLToPath(uri)),
		statement.source.value,
	)
	try {
		await fs.access(file)
	} catch {
		return []
	}
	return [
		{
			uri: pathToFileURL(file).href,
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
		},
	]
}

export function attributeHover(source: string, offset: number) {
	const statement = attributedImports(source).find(
		(item) => offset >= item.start && offset <= item.end,
	)
	if (!statement) return undefined
	const attributes = importAttributes(statement)
	if (attributes.type === "code")
		return {
			contents: {
				kind: "markdown",
				value: `**Code component** · ${attributes.lang ?? path.extname(statement.source.value).slice(1)}\n\nReads \`${statement.source.value}\` as source without executing it. Renders a fenced Markdown code block.`,
			},
		}
	if (attributes.type === "text")
		return {
			contents: {
				kind: "markdown",
				value: `**Raw text** · \`string\`\n\nReads \`${statement.source.value}\` without executing it.`,
			},
		}
	return undefined
}
