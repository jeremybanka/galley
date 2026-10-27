import * as vscode from "vscode"
import { LanguageClient, TransportKind } from "vscode-languageclient/node"
import type { EditorPreview } from "../editor/preview.ts"
import {
	componentAt,
	previewSummary,
	retainPreviews,
	reconcilePreviews,
	type TrackedPreview,
} from "./preview-model.ts"

type Snapshot = Omit<EditorPreview, "components"> & {
	components: TrackedPreview[]
	version: number
	stale?: boolean
}
let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.isTrusted) return
	const output = vscode.window.createOutputChannel("galley.md", { log: true })
	const snapshots = new Map<string, Snapshot>()
	let nextPreviewId = 0
	const failures = new Map<string, string>()
	const diagnostics =
		vscode.languages.createDiagnosticCollection("galley-preview")
	const status = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		20,
	)
	status.command = "workbench.actions.view.problems"
	function updateStatus() {
		const document = vscode.window.activeTextEditor?.document
		if (!document || document.languageId !== "galley") {
			status.hide()
			return
		}
		const failure = failures.get(document.uri.toString())
		const snapshot = snapshots.get(document.uri.toString())
		status.text = failure
			? "$(warning) Galley: preview failed"
			: snapshot?.errors.length
				? `$(warning) Galley: ${snapshot.errors.length} preview errors`
				: snapshot?.stale
					? "$(history) Galley: previous preview"
					: snapshot
						? "$(check) Galley"
						: "$(code) Galley"
		status.tooltip =
			failure ??
			(snapshot?.stale
				? "Showing output from the previous evaluation. Save or refresh to evaluate again."
				: "Galley TypeScript MDX. Preview errors appear in Problems.")
		status.show()
	}
	function report(
		document: vscode.TextDocument,
		errors: EditorPreview["errors"],
	) {
		diagnostics.set(
			document.uri,
			errors.map((error) => {
				const local = error.file === document.uri.fsPath
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(
						document.positionAt(local ? error.start : 0),
						document.positionAt(local ? error.end : 0),
					),
					`Preview: ${error.message}${local ? "" : ` (${error.file})`}`,
					vscode.DiagnosticSeverity.Error,
				)
				diagnostic.source = "galley preview"
				return diagnostic
			}),
		)
	}
	const pending = new Map<string, vscode.CancellationTokenSource>()
	const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
	const changes = new vscode.EventEmitter<void>()
	const previewChanges = new vscode.EventEmitter<vscode.Uri>()
	const ghosts = vscode.window.createTextEditorDecorationType({
		after: {
			color: new vscode.ThemeColor("editorGhostText.foreground"),
			fontStyle: "italic",
			margin: "0 0 0 1em",
		},
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	})
	const selector = { language: "galley", scheme: "file" }
	const previewsEnabled = () =>
		vscode.workspace.getConfiguration("galley").get("preview.enabled", true)
	const previewUri = (uri: string, id: number) =>
		vscode.Uri.from({
			scheme: "galley-output",
			path: "/Generated.md",
			query: JSON.stringify({ uri, id }),
		})
	function current(document: vscode.TextDocument) {
		const snapshot = snapshots.get(document.uri.toString())
		return snapshot?.version === document.version ? snapshot : undefined
	}
	function decorate() {
		for (const editor of vscode.window.visibleTextEditors) {
			const snapshot = current(editor.document)
			editor.setDecorations(
				ghosts,
				(snapshot?.components ?? []).map((component) => ({
					range: new vscode.Range(
						editor.document.positionAt(component.end),
						editor.document.positionAt(component.end),
					),
					renderOptions: {
						after: {
							contentText:
								previewSummary(component.markdown) +
								(snapshot?.stale || component.stale
									? " · previous preview"
									: snapshot?.errors.length
										? " · partial document"
										: ""),
						},
					},
					hoverMessage: new vscode.MarkdownString().appendCodeblock(
						component.markdown,
						"markdown",
					),
				})),
			)
		}
	}
	function clear(uri: string) {
		pending.get(uri)?.cancel()
		const snapshot = snapshots.get(uri)
		snapshots.delete(uri)
		failures.delete(uri)
		diagnostics.delete(vscode.Uri.parse(uri))
		for (const component of snapshot?.components ?? [])
			previewChanges.fire(previewUri(uri, component.id))
		decorate()
		changes.fire()
		updateStatus()
	}
	async function refresh(document: vscode.TextDocument) {
		if (
			!previewsEnabled() ||
			!vscode.languages.match(selector, document) ||
			!client?.isRunning()
		)
			return
		const uri = document.uri.toString()
		pending.get(uri)?.cancel()
		pending.get(uri)?.dispose()
		const cancellation = new vscode.CancellationTokenSource()
		pending.set(uri, cancellation)
		try {
			const response = await client.sendRequest<
				EditorPreview & { version: number }
			>("galley/preview", { uri }, cancellation.token)
			if (
				cancellation.token.isCancellationRequested ||
				response.version !== document.version ||
				document.isClosed
			)
				return
			const previous = snapshots.get(uri)
			const snapshot: Snapshot = {
				...response,
				components: reconcilePreviews(
					previous?.components ?? [],
					response.components.filter(
						({ file }) => file === document.uri.fsPath,
					),
					response.errors,
					() => nextPreviewId++,
				),
			}
			snapshots.set(uri, snapshot)
			failures.delete(uri)
			report(document, snapshot.errors)
			updateStatus()
			for (const component of [
				...(previous?.components ?? []),
				...snapshot.components,
			])
				previewChanges.fire(previewUri(uri, component.id))
			decorate()
			changes.fire()
		} catch (error) {
			if (!cancellation.token.isCancellationRequested) {
				const message = error instanceof Error ? error.message : String(error)
				failures.set(uri, message)
				const previous = snapshots.get(uri)
				if (previous) {
					previous.stale = true
					for (const component of previous.components)
						previewChanges.fire(previewUri(uri, component.id))
				}
				report(document, [
					{ file: document.uri.fsPath, start: 0, end: 1, message },
				])
				decorate()
				changes.fire()
				updateStatus()
				output.appendLine(
					`Preview: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} finally {
			if (pending.get(uri) === cancellation) pending.delete(uri)
			cancellation.dispose()
		}
	}
	function schedule(document: vscode.TextDocument) {
		const uri = document.uri.toString()
		clearTimeout(refreshTimers.get(uri))
		refreshTimers.set(
			uri,
			setTimeout(() => {
				refreshTimers.delete(uri)
				void refresh(document)
			}, 250),
		)
	}
	function dependencyChanged(file: vscode.Uri) {
		for (const document of vscode.workspace.textDocuments) {
			if (
				snapshots
					.get(document.uri.toString())
					?.dependencies.includes(file.fsPath)
			)
				schedule(document)
		}
	}
	const watcher = vscode.workspace.createFileSystemWatcher("**/*")
	context.subscriptions.push(
		output,
		diagnostics,
		status,
		vscode.window.onDidChangeActiveTextEditor(updateStatus),
		ghosts,
		changes,
		previewChanges,
		watcher,
		watcher.onDidChange(dependencyChanged),
		watcher.onDidCreate(dependencyChanged),
		watcher.onDidDelete(dependencyChanged),
		vscode.workspace.registerTextDocumentContentProvider("galley-output", {
			onDidChange: previewChanges.event,
			provideTextDocumentContent(uri) {
				const query = JSON.parse(uri.query) as { uri: string; id: number }
				const snapshot = snapshots.get(query.uri)
				const component = snapshot?.components.find(({ id }) => id === query.id)
				if (!component)
					return "Preview is out of date. Refresh component output.\n"
				return (
					(snapshot?.stale || component.stale
						? "<!-- Previous evaluation. Save or refresh to update. -->\n\n"
						: snapshot?.errors.length
							? "<!-- Partial document: see preview errors in Problems. -->\n\n"
							: "") + component.markdown
				)
			},
		}),
		vscode.languages.registerHoverProvider(selector, {
			provideHover(document, position) {
				const component = componentAt(
					current(document)?.components ?? [],
					document.offsetAt(position),
				)
				if (!component) return
				const hover = new vscode.MarkdownString("**Generated Markdown**\n\n")
				if (current(document)?.stale || component.stale)
					hover.appendMarkdown(
						"Previous evaluation; source or dependencies may have changed. Save or refresh to update.\n\n",
					)
				hover.appendCodeblock(component.markdown, "markdown")
				return new vscode.Hover(
					hover,
					new vscode.Range(
						document.positionAt(component.start),
						document.positionAt(component.end),
					),
				)
			},
		}),
		vscode.languages.registerCodeLensProvider(selector, {
			onDidChangeCodeLenses: changes.event,
			provideCodeLenses(document) {
				return (current(document)?.components ?? []).map(
					(component) =>
						new vscode.CodeLens(
							new vscode.Range(
								document.positionAt(component.start),
								document.positionAt(component.start),
							),
							{
								title: "Peek Generated Markdown",
								command: "galley.peekOutput",
								arguments: [document.uri, component.id],
							},
						),
				)
			},
		}),
		vscode.commands.registerCommand(
			"galley.peekOutput",
			async (uri?: vscode.Uri, id?: number) => {
				const editor = vscode.window.activeTextEditor
				const document = uri
					? await vscode.workspace.openTextDocument(uri)
					: editor?.document
				if (!document) return
				const snapshot = current(document)
				const component =
					id === undefined
						? componentAt(
								snapshot?.components ?? [],
								document.offsetAt(
									editor?.selection.active ?? new vscode.Position(0, 0),
								),
							)
						: snapshot?.components.find((item) => item.id === id)
				if (!component) return
				await vscode.commands.executeCommand(
					"editor.action.peekLocations",
					document.uri,
					document.positionAt(component.end),
					[
						new vscode.Location(
							previewUri(document.uri.toString(), component.id),
							new vscode.Position(0, 0),
						),
					],
					"peek",
				)
			},
		),
		vscode.commands.registerCommand("galley.refreshPreview", () => {
			const document = vscode.window.activeTextEditor?.document
			if (document) return refresh(document)
		}),
		vscode.commands.registerCommand("galley.restartServer", async () => {
			for (const uri of snapshots.keys()) clear(uri)
			await client?.restart()
			for (const document of vscode.workspace.textDocuments) schedule(document)
		}),
		vscode.workspace.onDidOpenTextDocument(schedule),
		vscode.workspace.onDidSaveTextDocument((document) => {
			schedule(document)
			dependencyChanged(document.uri)
		}),
		vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
			const uri = document.uri.toString()
			pending.get(uri)?.cancel()
			failures.delete(uri)
			diagnostics.delete(document.uri)
			const previous = snapshots.get(uri)
			let anchorsChanged = false
			if (previous) {
				const oldComponents = previous.components
				previous.components = retainPreviews(oldComponents, contentChanges)
				// VS Code tracks lens positions through edits. Stable IDs keep their
				// commands valid; only removed anchors need an explicit invalidation.
				anchorsChanged = oldComponents.length !== previous.components.length
				previous.version = document.version
				previous.stale = true
				previous.errors = []
				for (const component of [...oldComponents, ...previous.components])
					previewChanges.fire(previewUri(uri, component.id))
			}
			decorate()
			if (anchorsChanged) changes.fire()
			updateStatus()
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			clear(document.uri.toString())
			clearTimeout(refreshTimers.get(document.uri.toString()))
			refreshTimers.delete(document.uri.toString())
		}),
		vscode.window.onDidChangeVisibleTextEditors(decorate),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration("galley.preview.enabled")) return
			for (const document of vscode.workspace.textDocuments) {
				clear(document.uri.toString())
				if (previewsEnabled()) schedule(document)
			}
		}),
		{
			dispose() {
				for (const token of pending.values()) {
					token.cancel()
					token.dispose()
				}
				for (const timer of refreshTimers.values()) clearTimeout(timer)
			},
		},
	)
	client = new LanguageClient(
		"galley",
		"galley.md",
		{
			module: context.asAbsolutePath("dist/lsp.mjs"),
			transport: TransportKind.stdio,
		},
		{
			documentSelector: [selector],
			initializationOptions: { preview: true },
			outputChannel: output,
			synchronize: { fileEvents: watcher },
		},
	)
	await client.start()
	for (const document of vscode.workspace.textDocuments) schedule(document)
}

export async function deactivate() {
	await client?.stop()
	client = undefined
}
