import { previewEditorMarkdown } from "../compile.ts"

process.once("message", (request: { input: string; source: string }) => {
	previewEditorMarkdown(request.input, request.source).then(
		(result) => process.send?.({ result }),
		(error: unknown) =>
			process.send?.({
				error: error instanceof Error ? error.message : String(error),
			}),
	)
})
