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
	export interface IntrinsicAttributes {
		key?: string | number
	}
	export interface ElementChildrenAttribute {
		children: unknown
	}
	export interface IntrinsicElements {
		p: Children
		h1: Children
		h2: Children
		h3: Children
		h4: Children
		h5: Children
		h6: Children
		strong: Children
		em: Children
		del: Children
		blockquote: Children
		a: Children & { href: string }
		br: Record<string, never>
		hr: Record<string, never>
		table: Children
		thead: Children
		tbody: Children
		tr: Children
		th: Children & { align?: "left" | "center" | "right" }
		td: Children
		"galley-fragment": Children
	}
}

type Children = { children?: Content; key?: string | number }
