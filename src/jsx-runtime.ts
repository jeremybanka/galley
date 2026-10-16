import type { Component, Content, Element } from "./types.ts"

export const Fragment = "md-x-fragment"

export function jsx(
	type: string | Component<never>,
	props: Record<string, unknown> | null,
): Element {
	return { kind: "md-x:element", type, props: props ?? {} }
}

export { jsx as jsxDEV, jsx as jsxs }

// TypeScript's automatic JSX runtime uses this namespace for TSX components.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
	export type Element = Content
	export type ElementType = string | Component<never>
	export interface ElementChildrenAttribute {
		children: unknown
	}
	export interface IntrinsicElements {
		[tag: string]: Record<string, unknown>
	}
}
