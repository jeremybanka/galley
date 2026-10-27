import type { ComponentPreview } from "../types.ts"
import type { PreviewFailure } from "../editor/recovery.ts"

export function previewSummary(markdown: string): string {
	const lines = markdown.trimEnd().split("\n")
	const code = /^(`{3,}|~{3,})(.*)$/.exec(lines[0] ?? "")
	const first =
		(code ? lines.slice(1, -1) : lines).find((line) => line.trim()) ??
		"(no output)"
	return `  → ${first.slice(0, 100)}${first.length > 100 ? "…" : ""}${lines.length > 1 ? ` · ${lines.length} lines` : ""}`
}

export function componentAt<T extends ComponentPreview>(
	components: T[],
	offset: number,
): T | undefined {
	return components
		.filter(({ start, end }) => offset >= start && offset <= end)
		.sort((a, b) => a.end - a.start - (b.end - b.start))[0]
}

export type SourceChange = {
	rangeOffset: number
	rangeLength: number
	text: string
}

/** Track preview anchors through edits without requiring a complete syntax tree. */
export function retainPreviews<T extends ComponentPreview>(
	components: T[],
	changes: readonly SourceChange[],
): T[] {
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
			// Removing/replacing the entire region also removes its preview anchor.
			if (change.rangeOffset <= component.start && end >= component.end)
				return []
			return [
				{
					...component,
					start: Math.min(component.start, change.rangeOffset),
					end: Math.max(
						component.end + delta,
						change.rangeOffset + change.text.length,
					),
				},
			]
		})
	}
	return retained
}

export type TrackedPreview = ComponentPreview & { id: number; stale?: boolean }

/** Keep peek document identities stable when evaluation replaces the output. */
export function reconcilePreviews(
	previous: TrackedPreview[],
	components: ComponentPreview[],
	errors: PreviewFailure[],
	allocateId: () => number,
): TrackedPreview[] {
	const remaining = new Set(previous)
	const result: TrackedPreview[] = components.map((component) => {
		const old = previous.find(
			(item) =>
				remaining.has(item) &&
				item.file === component.file &&
				item.start === component.start,
		)
		if (old) remaining.delete(old)
		return { ...component, id: old?.id ?? allocateId() }
	})
	// Partial evaluation cannot prove that an unmatched region stopped producing
	// output: its diagnostic may point outside the region (for example at EOF).
	if (errors.length) {
		for (const component of remaining)
			result.push({ ...component, stale: true })
	}
	return result.sort((a, b) => a.start - b.start || a.end - b.end)
}
