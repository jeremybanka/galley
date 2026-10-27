import { existsSync } from "node:fs"
import path from "node:path"
import { projectTypescript } from "./projection.ts"

import { documentImports, importAttributes } from "../editor/document.ts"
import type {
	ImportType,
	MappedOutput,
	MapperDiagnostic,
	OpenProject,
	SpanMapping,
	Transform,
} from "./protocol.ts"

const projects = new Map<string, ImportType[]>()
export const builtinImportTypes: readonly ImportType[] = [
	{
		type: "code",
		valueType: 'import("galley.md").Component<Record<string, never>>',
		attributes: { lang: true },
	},
	{ type: "text", valueType: "string" },
]

export async function openProject(params: OpenProject) {
	const { importTypes = [], ...options } = params.options ?? {}
	if (
		!Array.isArray(importTypes) ||
		importTypes.some(
			(item: ImportType) =>
				!item ||
				typeof item.type !== "string" ||
				typeof item.valueType !== "string" ||
				item.valueType.includes("*/"),
		)
	) {
		throw new Error("importTypes must contain type and valueType strings.")
	}
	projects.set(params.projectHandle, [...importTypes, ...builtinImportTypes])
	return {
		optionDiagnostics: Object.keys(options).map((key) => ({
			path: [key],
			messageText: `Unknown galley mapper option: ${key}`,
			code: 95003,
		})),
	}
}

export function closeProject(params: { projectHandle: string }) {
	projects.delete(params.projectHandle)
}

function transformMdx(params: Transform): MappedOutput {
	return projectTypescript(params.content)
}

/** Compose the MDX projection with our attributed-import projection. */
function compose(outer: SpanMapping[], inner: SpanMapping[]): SpanMapping[] {
	return outer.flatMap(([v, vl, o, ol, kind, features]) =>
		inner.flatMap(([iv, ivl, io]) => {
			const start = Math.max(o, iv)
			const end = Math.min(o + ol, iv + ivl)
			if (end <= start) return []
			if (kind !== 0) {
				return start === o && end === o + ol
					? [[v, vl, io + o - iv, ol, kind, features] as SpanMapping]
					: []
			}
			return [
				[
					v + start - o,
					end - start,
					io + start - iv,
					end - start,
					0,
					features,
				] as SpanMapping,
			]
		}),
	)
}

export function transform(params: Transform): MappedOutput {
	const types = projects.get(params.projectHandle)
	if (!types) throw new Error("Unknown galley content-mapper project.")
	let imports
	try {
		imports = documentImports(params.content).filter(
			(item) => item.importKind !== "type" && item.attributes?.length,
		)
	} catch {
		// Recover complete code islands while the next island is being edited.
		return transformMdx(params)
	}
	let content = ""
	let cursor = 0
	const mappings: SpanMapping[] = []
	const diagnostics: MapperDiagnostic[] = []
	function verbatim(start: number, end: number) {
		if (end > start)
			mappings.push([content.length, end - start, start, end - start, 0])
		content += params.content.slice(start, end)
	}

	for (const statement of imports) {
		verbatim(cursor, statement.start)
		const attributes = importAttributes(statement)
		const definition = types.find((item) => item.type === attributes.type)
		const report = (
			messageText: string,
			start = statement.start,
			end = statement.end,
		) =>
			diagnostics.push({ start, length: end - start, code: 95001, messageText })
		if (
			(attributes.type === "code" || attributes.type === "text") &&
			(statement.source.value.startsWith(".") ||
				path.isAbsolute(statement.source.value)) &&
			!existsSync(
				path.resolve(path.dirname(params.fileName), statement.source.value),
			)
		) {
			report(
				`Cannot read ${attributes.type} import ${JSON.stringify(statement.source.value)}.`,
				statement.source.start,
				statement.source.end,
			)
		}
		if (!definition)
			report(
				`Unknown galley import type ${JSON.stringify(attributes.type)}. Register its editor semantics with importTypes.`,
			)
		for (const attribute of statement.attributes ?? []) {
			const key = attribute.key.name ?? attribute.key.value ?? ""
			if (key === "type" || !definition) continue
			const allowed = definition.attributes?.[key]
			if (!allowed)
				report(
					`Unknown ${attributes.type} import attribute: ${key}`,
					attribute.start,
					attribute.end,
				)
			else if (
				Array.isArray(allowed) &&
				!allowed.includes(attribute.value.value)
			)
				report(
					`Expected one of ${allowed.join(", ")} for ${key}.`,
					attribute.value.start,
					attribute.value.end,
				)
			if (
				attributes.type === "code" &&
				key === "lang" &&
				/[\r\n`]/.test(attribute.value.value)
			)
				report(
					"Code languages cannot contain newlines or backticks.",
					attribute.value.start,
					attribute.value.end,
				)
		}
		if (
			statement.specifiers.length !== 1 ||
			statement.specifiers[0]?.type !== "ImportDefaultSpecifier"
		) {
			report("Attributed galley imports require a single default import.")
			content += "export {};"
		} else {
			const local = statement.specifiers[0].local
			content += "export const "
			verbatim(local.start, local.end)
			content += ` = null as unknown as ${definition?.valueType ?? "unknown"};`
		}
		cursor = statement.end
	}
	verbatim(cursor, params.content.length)
	const result = transformMdx({ ...params, content })
	function remap(output: MappedOutput): MappedOutput {
		return {
			...output,
			mappings: compose(output.mappings ?? [], mappings),
			...(output.supplemental
				? { supplemental: output.supplemental.map(remap) }
				: {}),
		}
	}
	return {
		...remap(result),
		diagnostics: [
			...diagnostics,
			...(result.diagnostics ?? []).map((diagnostic) => {
				const segment = mappings.find(
					([v, length]) =>
						diagnostic.start >= v && diagnostic.start < v + length,
				)
				return {
					...diagnostic,
					start: segment ? segment[2] + diagnostic.start - segment[0] : 0,
				}
			}),
		],
	}
}
