import { stripVTControlCharacters } from "node:util"
import { expect, test } from "vite-plus/test"
import { diffColors, formatCheckDiff } from "../../src/check-diff.ts"
import current from "#fixtures/cli/whitespace.mdx" with { type: "text" }
import previous from "#fixtures/cli/whitespace-stale.md" with { type: "text" }
import expected from "#fixtures/cli/whitespace.expected.md" with { type: "text" }

test("shows tabs, spaces, trailing whitespace and old/new line numbers", () => {
	expect(formatCheckDiff("README.md", previous, current, false)).toBe(
		"\n" + expected,
	)
})

test("colors changed lines and highlights only the changed characters", () => {
	const colored = formatCheckDiff("README.md", previous, current, true)
	expect(stripVTControlCharacters(colored)).toBe("\n" + expected)
	expect(colored).toContain(
		"\u001b[31m-\u001b[39m\u001b[41m\u001b[30m→\u001b[39m\u001b[49m\u001b[31m-·Run·tests\u001b[39m",
	)
	expect(colored).toContain(
		"\u001b[32m+\u001b[39m\u001b[42m\u001b[30m··\u001b[39m\u001b[49m\u001b[32m-·Run·tests\u001b[39m",
	)
	expect(colored).toContain(
		"Ready.\u001b[39m\u001b[41m\u001b[30m·\u001b[39m\u001b[49m",
	)
})

test("preserves carriage-return changes and missing final newline markers", () => {
	const windows = current.replaceAll("\n", "\r\n").trimEnd()
	const plain = formatCheckDiff("README.md", windows, current, false)
	expect(plain).toContain("1  │-#·Setup␍\n")
	expect(plain).toContain("6  │-Ready.\n   │\\ No newline at end of file\n")
	expect(plain).toContain("  1│+#·Setup\n")
	expect(
		stripVTControlCharacters(
			formatCheckDiff("README.md", windows, current, true),
		),
	).toBe(plain)
})

test("handles additions, deletions, empty output and unequal replacement blocks", () => {
	for (const [before, after] of [
		[undefined, current],
		[undefined, ""],
		[current, ""],
		[current, current.replaceAll("\n", " ")],
		[current.trimEnd(), current],
	]) {
		const plain = formatCheckDiff("README.md", before, after!, false)
		const colored = formatCheckDiff("README.md", before, after!, true)
		expect(stripVTControlCharacters(colored)).toBe(plain)
		expect(plain).not.toContain("undefined")
	}
	expect(formatCheckDiff("README.md", undefined, "", false)).toContain(
		"from README.md (missing)",
	)
	expect(formatCheckDiff("README.md", current, "", false)).toContain(
		"1  │-#·Setup",
	)
})

test("large rewrites retain the complete diff when character highlighting exceeds its budget", () => {
	const large = previous.repeat(1000)
	const plain = formatCheckDiff("README.md", large, current, false)
	expect(
		stripVTControlCharacters(
			formatCheckDiff("README.md", large, current, true),
		),
	).toBe(plain)
	expect(plain).toContain("6000     │-Ready.·")
})

test.each([
	[{}, false, false],
	[{}, true, true],
	[{ GITHUB_ACTIONS: "true" }, false, true],
	[{ GITHUB_ACTIONS: "false" }, false, false],
	[{ TERM: "dumb" }, true, false],
	[{ FORCE_COLOR: "1" }, false, true],
	[{ FORCE_COLOR: "0", GITHUB_ACTIONS: "true" }, true, false],
	[{ NO_COLOR: "1", GITHUB_ACTIONS: "true", FORCE_COLOR: "1" }, true, false],
	[{ NODE_DISABLE_COLORS: "1" }, true, false],
])("color policy for %j with TTY %s", (env, tty, enabled) => {
	expect(diffColors(env, tty)).toBe(enabled)
})
