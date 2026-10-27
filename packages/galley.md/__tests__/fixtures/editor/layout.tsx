import type { Content } from "galley.md"
export default function Layout({ children }: { children?: Content }) {
	return <blockquote>{children}</blockquote>
}
export const note = "layout"
