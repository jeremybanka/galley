import { fork } from "node:child_process"
import type { CancellationToken } from "vscode-jsonrpc"
import type { DocumentPreview } from "../types.ts"
import { runtimeEntry } from "./paths.ts"

/** Keep user component output and failures out of the language-server process. */
export function evaluatePreview(
	input: string,
	source: string,
	token?: CancellationToken,
	timeout = 15_000,
): Promise<DocumentPreview> {
	return new Promise((resolve, reject) => {
		const child = fork(
			runtimeEntry("preview-worker", "editor/preview-worker"),
			[],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				execArgv: [],
			},
		)
		let settled = false
		const finish = (error?: Error, result?: DocumentPreview) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			cancellation?.dispose()
			child.kill()
			if (error) reject(error)
			else if (result) resolve(result)
		}
		const timer = setTimeout(
			() => finish(new Error("Component preview timed out.")),
			timeout,
		)
		const cancellation = token?.onCancellationRequested(() =>
			finish(new Error("Component preview cancelled.")),
		)
		child.on("error", (error) => finish(error))
		child.on("exit", (code) =>
			finish(
				new Error(`Component preview exited before completing (${code}).`),
			),
		)
		child.once(
			"message",
			(message: { result?: DocumentPreview; error?: string }) =>
				finish(
					message.error ? new Error(message.error) : undefined,
					message.result,
				),
		)
		if (token?.isCancellationRequested)
			finish(new Error("Component preview cancelled."))
		else child.send({ input, source })
	})
}
