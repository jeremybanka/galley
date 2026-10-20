import type { Component, Content, Element } from "./types.ts"

export const Fragment = "galley-fragment"

export function jsx(
	type: string | Component<never>,
	props: Record<string, unknown> | null,
): Element {
	return { kind: "galley:element", type, props: props ?? {} }
}

export { jsx as jsxDEV, jsx as jsxs }

// TypeScript's automatic JSX runtime uses this namespace for TSX components.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
	export type Element = Content
	export type ElementType = keyof IntrinsicElements | Component<never>
	export interface ElementChildrenAttribute {
		children: unknown
	}
	export interface IntrinsicElements {
		p: Record<string, unknown>
		h1: Record<string, unknown>
		h2: Record<string, unknown>
		h3: Record<string, unknown>
		h4: Record<string, unknown>
		h5: Record<string, unknown>
		h6: Record<string, unknown>
		strong: Record<string, unknown>
		em: Record<string, unknown>
		del: Record<string, unknown>
		blockquote: Record<string, unknown>
		a: Record<string, unknown>
		br: Record<string, unknown>
		hr: Record<string, unknown>
		"galley-fragment": Record<string, unknown>
		// Markdown syntax in the editor's virtual JSX projection.
		code: Record<string, unknown>
		pre: Record<string, unknown>
		ul: Record<string, unknown>
		ol: Record<string, unknown>
		li: Record<string, unknown>
		img: Record<string, unknown>
	}
}
