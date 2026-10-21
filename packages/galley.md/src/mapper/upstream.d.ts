declare module "mdx-content-mapper/lib/requests/open-project.js" {
	export function openProject(
		params: import("./protocol.ts").OpenProject,
	): Promise<{
		optionDiagnostics?: {
			path: (string | number)[]
			code: number
			messageText: string
		}[]
	}>
}
declare module "mdx-content-mapper/lib/requests/close-project.js" {
	export function closeProject(params: { projectHandle: string }): void
}
declare module "mdx-content-mapper/lib/requests/transform.js" {
	export function transform(
		params: import("./protocol.ts").Transform,
	): import("./protocol.ts").MappedOutput
}
