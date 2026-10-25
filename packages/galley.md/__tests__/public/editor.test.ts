import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vite-plus/test"
import { previewMarkdown } from "galley.md"
import { fixture as project, parseMarkdown } from "./support.ts"

import savedDocument from "#fixtures/public/editor/saved.mdx" with { type: "text" }
import inlineComponent from "#fixtures/public/editor/inline.ts" with { type: "text" }
import inlineDocument from "#fixtures/public/editor/inline.mdx" with { type: "text" }

test("unsaved component previews preserve content, source offsets, and dependencies", async () => {
	const { directory, input } = await project({ "README.mdx": savedDocument })
	await fs.writeFile(path.join(directory, "inline.ts"), inlineComponent)
	const source = inlineDocument
	const result = await previewMarkdown(input, { source })
	expect(parseMarkdown(result.markdown)).toEqual(
		parseMarkdown("Hello **Ada**, welcome."),
	)
	expect(await fs.readFile(input, "utf8")).toBe(savedDocument)
	expect(result.dependencies).toContain(path.join(directory, "inline.ts"))
	expect(result.components).toHaveLength(1)
	const preview = result.components[0]!
	expect(preview.file).toBe(input)
	expect(source.slice(preview.start, preview.end)).toBe("<names.Name />")
	expect(parseMarkdown(preview.markdown)).toEqual(parseMarkdown("**Ada**"))
})
