import * as vscode from "vscode"
import { LanguageClient, TransportKind } from "vscode-languageclient/node"
import type { DocumentPreview } from "../types.ts"
import { componentAt, previewSummary } from "./preview-model.ts"

type Snapshot = DocumentPreview & { version: number }
let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.isTrusted) return
	const output = vscode.window.createOutputChannel("galley.mdx", { log: true })
	const snapshots = new Map<string, Snapshot>()
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
	const previewUri = (uri: string, start: number) =>
		vscode.Uri.from({
			scheme: "galley-output",
			path: "/Generated.md",
			query: JSON.stringify({ uri, start }),
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
						after: { contentText: previewSummary(component.markdown) },
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
		for (const component of snapshot?.components ?? [])
			previewChanges.fire(previewUri(uri, component.start))
		decorate()
		changes.fire()
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
			const snapshot = await client.sendRequest<Snapshot>(
				"galley/preview",
				{ uri },
				cancellation.token,
			)
			if (
				cancellation.token.isCancellationRequested ||
				snapshot.version !== document.version ||
				document.isClosed
			)
				return
			snapshot.components = snapshot.components.filter(
				({ file }) => file === document.uri.fsPath,
			)
			snapshots.set(uri, snapshot)
			for (const component of snapshot.components)
				previewChanges.fire(previewUri(uri, component.start))
			decorate()
			changes.fire()
		} catch (error) {
			if (!cancellation.token.isCancellationRequested) {
				clear(uri)
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
				const query = JSON.parse(uri.query) as { uri: string; start: number }
				return (
					snapshots
						.get(query.uri)
						?.components.find(({ start }) => start === query.start)?.markdown ??
					"Preview is out of date. Refresh component output.\n"
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
								arguments: [document.uri, component.start],
							},
						),
				)
			},
		}),
		vscode.commands.registerCommand(
			"galley.peekOutput",
			async (uri?: vscode.Uri, start?: number) => {
				const editor = vscode.window.activeTextEditor
				const document = uri
					? await vscode.workspace.openTextDocument(uri)
					: editor?.document
				if (!document) return
				const snapshot = current(document)
				const component =
					start === undefined
						? componentAt(
								snapshot?.components ?? [],
								document.offsetAt(
									editor?.selection.active ?? new vscode.Position(0, 0),
								),
							)
						: snapshot?.components.find((item) => item.start === start)
				if (!component) return
				await vscode.commands.executeCommand(
					"editor.action.peekLocations",
					document.uri,
					document.positionAt(component.end),
					[
						new vscode.Location(
							previewUri(document.uri.toString(), component.start),
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
		vscode.workspace.onDidChangeTextDocument(({ document }) =>
			clear(document.uri.toString()),
		),
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
		"galley.mdx",
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
