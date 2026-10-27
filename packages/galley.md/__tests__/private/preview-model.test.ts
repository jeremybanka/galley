// SPDX-License-Identifier: MPL-2.0
import { expect, test } from "vite-plus/test"
import {
	previewSummary,
	retainPreviews,
	reconcilePreviews,
	componentAt,
} from "../../src/vscode/preview-model.ts"
import summaryCode from "#fixtures/editor/summary.md" with { type: "text" }

test("native ghost summaries retain a line count and bound very long output", () => {
	expect(previewSummary(summaryCode)).toBe("  → const x = 1 · 3 lines")
	expect(previewSummary("x".repeat(1000)).length).toBeLessThan(120)
})

test("editing keeps preview anchors and accounts for UTF-16 insertions", () => {
	const components = [
		{ file: "doc.mdx", start: 0, end: 4, markdown: "before" },
		{ file: "doc.mdx", start: 10, end: 14, markdown: "edited" },
		{ file: "doc.mdx", start: 20, end: 24, markdown: "after" },
	]
	const result = retainPreviews(components, [
		{ rangeOffset: 11, rangeLength: 1, text: "👻x" },
	])
	expect(result.map(({ markdown }) => markdown)).toEqual([
		"before",
		"edited",
		"after",
	])
	expect(result[1]).toMatchObject({ start: 10, end: 16 })
	expect(result[2]).toMatchObject({ start: 22, end: 26 })
})

test("peek identities survive incomplete edits, error refreshes, and successful reevaluation", () => {
	let id = 0
	const original = [
		{ file: "doc.mdx", start: 5, end: 20, markdown: "old expression" },
		{ file: "doc.mdx", start: 25, end: 40, markdown: "old tag" },
	]
	const first = reconcilePreviews([], original, [], () => id++)
	// Simultaneous edits: insert UTF-16 text before both anchors, remove a brace,
	// and type inside the tag. No AST or evaluation is needed to keep the actions.
	const edited = retainPreviews(first, [
		{ rangeOffset: 0, rangeLength: 0, text: "👻" },
		{ rangeOffset: 19, rangeLength: 1, text: "" },
		{ rangeOffset: 30, rangeLength: 0, text: "x" },
	])
	expect(edited.map(({ id }) => id)).toEqual(first.map(({ id }) => id))
	expect(edited.map(({ start, end }) => [start, end])).toEqual([
		[7, 21],
		[26, 42],
	])
	expect(componentAt(edited, 10)?.markdown).toBe("old expression")
	const failed = reconcilePreviews(
		edited,
		[],
		[
			{ file: "doc.mdx", start: 7, end: 21, message: "incomplete expression" },
			{ file: "doc.mdx", start: 26, end: 42, message: "component failed" },
		],
		() => id++,
	)
	expect(failed.map(({ id }) => id)).toEqual(first.map(({ id }) => id))
	expect(failed.every(({ stale }) => stale)).toBe(true)
	expect(
		reconcilePreviews(
			edited,
			[],
			[{ file: "doc.mdx", start: 42, end: 42, message: "unexpected EOF" }],
			() => id++,
		).map(({ id }) => id),
	).toEqual(first.map(({ id }) => id))
	const fresh = reconcilePreviews(
		failed,
		edited.map((item) => ({ ...item, markdown: "new output" })),
		[],
		() => id++,
	)
	expect(fresh.map(({ id }) => id)).toEqual(first.map(({ id }) => id))
	expect(
		fresh.every(({ markdown, stale }) => markdown === "new output" && !stale),
	).toBe(true)
	expect(
		retainPreviews(fresh, [{ rangeOffset: 7, rangeLength: 14, text: "" }]),
	).toEqual([{ ...fresh[1], start: 12, end: 28 }])
	expect(reconcilePreviews(fresh, [], [], () => id++)).toEqual([])
})

test("preview anchors handle boundary insertions and partial replacements", () => {
	const components = [
		{ file: "doc.mdx", start: 10, end: 20, markdown: "output" },
	]
	expect(
		retainPreviews(components, [
			{ rangeOffset: 10, rangeLength: 0, text: "abc" },
		])[0],
	).toMatchObject({ start: 13, end: 23 })
	expect(
		retainPreviews(components, [
			{ rangeOffset: 20, rangeLength: 0, text: "abc" },
		])[0],
	).toEqual(components[0])
	expect(
		retainPreviews(components, [
			{ rangeOffset: 8, rangeLength: 5, text: "a" },
		])[0],
	).toMatchObject({ start: 8, end: 16 })
	expect(
		retainPreviews(components, [
			{ rangeOffset: 18, rangeLength: 5, text: "a" },
		])[0],
	).toMatchObject({ start: 10, end: 19 })
	expect(
		retainPreviews(components, [
			{ rangeOffset: 0, rangeLength: 30, text: "replacement" },
		]),
	).toEqual([])
})
