import { styleText } from "node:util"
import { diffChars, structuredPatch } from "diff"

interface Line {
	kind: string
	text: string
	noNewline: boolean
}

export function diffColors(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
	if (env.NO_COLOR || env.NODE_DISABLE_COLORS === "1") return false
	if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0"
	return env.TERM !== "dumb" && (isTTY || env.GITHUB_ACTIONS === "true")
}

function visible(text: string): string {
	return text
		.replaceAll(" ", "·")
		.replaceAll("\t", "→")
		.replaceAll("\r", "␍")
		.replaceAll("\u001b", "␛")
}

function styleParts(value: string, removed: boolean, changed: boolean): string {
	// Style each span independently: Node 22 does not restore nested styles.
	// diffColors already applies our stderr and GitHub Actions color policy.
	return value
		.split("\n")
		.map((part) =>
			part
				? styleText(
						changed
							? [removed ? "bgRed" : "bgGreen", "black"]
							: removed
								? "red"
								: "green",
						visible(part),
						{ validateStream: false },
					)
				: "",
		)
		.join("\n")
}

// Compare whole replacement blocks so wrapping changes do not shift line pairs.
function highlight(oldLines: Line[], newLines: Line[]): [string[], string[]] {
	const source = (lines: Line[]) =>
		lines.map((line) => line.text + (line.noNewline ? "" : "\n")).join("")
	const before = source(oldLines)
	const after = source(newLines)
	// Bound character-level work; large rewrites still get a complete line diff.
	const changes = diffChars(before, after, { maxEditLength: 1000 }) ?? [
		{ value: before, removed: true, added: false },
		{ value: after, removed: false, added: true },
	]
	const oldParts: string[] = []
	const newParts: string[] = []
	for (const change of changes) {
		if (!change.added)
			oldParts.push(styleParts(change.value, true, change.removed))
		if (!change.removed)
			newParts.push(styleParts(change.value, false, change.added))
	}
	return [oldParts.join("").split("\n"), newParts.join("").split("\n")]
}

export function formatCheckDiff(
	filename: string,
	previous: string | undefined,
	generated: string,
	color: boolean,
): string {
	const patch = structuredPatch(
		filename,
		filename,
		previous ?? "",
		generated,
		undefined,
		undefined,
		{ context: 3, stripTrailingCr: false },
	)
	const width = String(
		Math.max(
			1,
			...patch.hunks.map((hunk) =>
				Math.max(
					hunk.oldStart + hunk.oldLines - 1,
					hunk.newStart + hunk.newLines - 1,
				),
			),
		),
	).length
	const output = [
		`\nfrom ${filename}${previous === undefined ? " (missing)" : ""}\n`,
	]
	for (const [index, hunk] of patch.hunks.entries()) {
		if (index) output.push("--\n")
		let oldNumber = hunk.oldStart
		let newNumber = hunk.newStart
		const lines: Line[] = []
		for (const line of hunk.lines) {
			if (line.startsWith("\\")) {
				const last = lines.at(-1)
				if (last) last.noNewline = true
			} else
				lines.push({ kind: line[0]!, text: line.slice(1), noNewline: false })
		}
		const row = (line: Line, text: string) => {
			const oldColumn = line.kind === "+" ? "" : String(oldNumber++)
			const newColumn = line.kind === "-" ? "" : String(newNumber++)
			const columns = `${oldColumn.padStart(width)} ${newColumn.padStart(width)}│`
			const sign =
				line.kind === " " || !color
					? line.kind
					: styleText(line.kind === "-" ? "red" : "green", line.kind, {
							validateStream: false,
						})
			output.push(columns + sign + text + "\n")
			if (line.noNewline)
				output.push(
					`${" ".repeat(width * 2 + 1)}│\\ No newline at end of file\n`,
				)
		}
		for (let position = 0; position < lines.length;) {
			const line = lines[position]!
			if (line.kind === " ") {
				row(line, visible(line.text))
				position++
				continue
			}
			const removed: Line[] = []
			const added: Line[] = []
			while (position < lines.length && lines[position]!.kind !== " ") {
				const changed = lines[position++]!
				;(changed.kind === "-" ? removed : added).push(changed)
			}
			const [oldText, newText] = color
				? highlight(removed, added)
				: [
						removed.map((item) => visible(item.text)),
						added.map((item) => visible(item.text)),
					]
			removed.forEach((item, i) => row(item, oldText[i]!))
			added.forEach((item, i) => row(item, newText[i]!))
		}
	}
	output.push("\n- existing  + generated  · space  → tab  ␍ carriage return\n")
	return output.join("")
}
