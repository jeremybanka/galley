import type { Plugin } from "esbuild"
import type { Root, RootContent } from "mdast"

export type DocumentContext = {
	/** Absolute path of the MDX document containing the component. */
	path: string
	/** Resolve component inputs relative to this directory. */
	directory: string
}

export type Component<Props = Record<string, unknown>> = (
	props: Props,
	context: DocumentContext,
) => Content

export type Element = {
	kind: "md-x:element"
	type: string | Component<never>
	props: Record<string, unknown>
}

type SyncContent =
	| Element
	| Root
	| RootContent
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly Content[]

export type Content = SyncContent | Promise<SyncContent>

export type CompileOptions = {
	/** Plugins run before the built-in MDX and code import plugins. */
	plugins?: readonly Plugin[]
}

export type RunOptions = CompileOptions & {
	mode: "write" | "check"
	/** Defaults to the input path with its extension replaced by .md. */
	output?: string
}

export type RunResult = {
	changed: boolean
	outputPath: string
	markdown: string
}
