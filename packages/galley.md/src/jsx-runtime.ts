import type { JSX as ReactJSX } from "react"
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
	export interface IntrinsicElements extends NativeElements {
		[tag: `${string}-${string}`]: StaticAttributes<
			ReactJSX.IntrinsicElements["div"]
		>
	}
}

type HtmlAttribute =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly (string | number)[]
type OmittedAttribute =
	| `on${string}`
	| "children"
	| "key"
	| "ref"
	| "style"
	| "dangerouslySetInnerHTML"
	| "suppressContentEditableWarning"
	| "suppressHydrationWarning"
type SerializableAttributes<Props> = {
	[Key in keyof Props as Key extends OmittedAttribute ? never : Key]: Extract<
		Props[Key],
		HtmlAttribute
	>
}
type HtmlNames<Props> = {
	[
		Key in keyof SerializableAttributes<Props> as Key extends string
			? Key extends "className"
				? "class"
				: Key extends "htmlFor"
					? "for"
					: Lowercase<Key>
			: never
	]: SerializableAttributes<Props>[Key]
}
type StaticAttributes<Props> = SerializableAttributes<Props> &
	HtmlNames<Props> & {
		children?: Content
		key?: string | number
		style?: string
		/** Legacy alignment remains useful in README renderers. */
		align?: "left" | "center" | "right" | "justify" | "char"
		[attribute: `data-${string}`]: HtmlAttribute
	}

type NativeElements = {
	[Tag in keyof ReactJSX.IntrinsicElements]: StaticAttributes<
		ReactJSX.IntrinsicElements[Tag]
	>
}
