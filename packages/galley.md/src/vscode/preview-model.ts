import type { ComponentPreview } from "../types.ts"

export function previewSummary(markdown: string): string {
	const lines = markdown.trimEnd().split("\n")
	const code = /^(`{3,}|~{3,})(.*)$/.exec(lines[0] ?? "")
	const first =
		(code ? lines.slice(1, -1) : lines).find((line) => line.trim()) ??
		"(no output)"
	return `  → ${first.slice(0, 100)}${first.length > 100 ? "…" : ""}${lines.length > 1 ? ` · ${lines.length} lines` : ""}`
}

export function componentAt(
	components: ComponentPreview[],
	offset: number,
): ComponentPreview | undefined {
	return components
		.filter(({ start, end }) => offset >= start && offset <= end)
		.sort((a, b) => a.end - a.start - (b.end - b.start))[0]
}

export type SourceChange = {
	rangeOffset: number
	rangeLength: number
	text: string
}

/** Keep only previews whose authored source survived the edit, with current offsets. */
export function retainPreviews(
	components: ComponentPreview[],
	changes: readonly SourceChange[],
): ComponentPreview[] {
	let retained = components
	for (const change of [...changes].sort(
		(a, b) => b.rangeOffset - a.rangeOffset,
	)) {
		const end = change.rangeOffset + change.rangeLength
		const delta = change.text.length - change.rangeLength
		retained = retained.flatMap((component) => {
			if (component.end <= change.rangeOffset) return [component]
			if (component.start >= end)
				return [
					{
						...component,
						start: component.start + delta,
						end: component.end + delta,
					},
				]
			return []
		})
	}
	return retained
}
