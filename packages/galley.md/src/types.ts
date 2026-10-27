import type { Plugin } from "esbuild"
import type { Root, RootContent } from "mdast"

export type DocumentContext = {
	/** Absolute path of the MDX document containing the component. */
	path: string
	/** Resolve component inputs relative to this directory. */
	directory: string
}

export type Component<Props = Record<string, never>> = (
	props: Props,
	context: DocumentContext,
) => Content

export type Element = {
	kind: "galley:element"
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

export type ComponentPreview = {
	file: string
	start: number
	end: number
	markdown: string
}

export type PreviewOptions = CompileOptions & {
	/** Unsaved document text. The source file is never modified. */
	source?: string
}

export type DocumentPreview = {
	markdown: string
	components: ComponentPreview[]
	dependencies: string[]
}

export type RunOptions = CompileOptions & {
	mode: "write" | "check"
	/** Overrides galley.output frontmatter; relative paths use the working directory. */
	output?: string
}

export type RunResult = {
	changed: boolean
	outputPath: string
	markdown: string
}
