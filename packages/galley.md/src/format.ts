import { readFileSync } from "node:fs"

import { createFromBuffer, type Formatter } from "@dprint/formatter"
import { getPath } from "@dprint/markdown"

let formatter: Formatter | undefined

/** Normalize Markdown layout while preserving source examples and explicit HTML. */
export function formatMarkdown(markdown: string): string {
	if (!formatter) {
		formatter = createFromBuffer(readFileSync(getPath()))
		formatter.setConfig(
			{ lineWidth: 80, newLineKind: "lf" },
			{
				"codeBlock.skipFormat": true,
				"codeBlock.preserveIndentation": true,
				"codeBlock.preserveBlankLines": true,
				"html.skipFormat": true,
			},
		)
	}
	return formatter.formatText({ filePath: "output.md", fileText: markdown })
}
