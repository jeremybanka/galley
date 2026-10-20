import { previewMarkdown } from "../compile.ts"

process.once("message", (request: { input: string; source: string }) => {
	previewMarkdown(request.input, { source: request.source }).then(
		(result) => process.send?.({ result }),
		(error: unknown) =>
			process.send?.({
				error: error instanceof Error ? error.message : String(error),
			}),
	)
})
