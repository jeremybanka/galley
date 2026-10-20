/** TypeScript 7.1 content-mapper protocol. Offsets use UTF-16 code units. */
export type SpanMapping = [number, number, number, number, number, number?]
export type MapperDiagnostic = {
	start: number
	length: number
	code: number
	messageText: string
}
export type MappedOutput = {
	text: string
	extension: string
	mappings?: SpanMapping[]
	diagnostics?: MapperDiagnostic[]
	supplemental?: MappedOutput[]
}
export type OpenProject = {
	projectHandle: string
	configFileName: string
	compilerOptions: Record<string, unknown>
	options?: Record<string, unknown>
}
export type Transform = {
	projectHandle: string
	fileName: string
	content: string
}

/** Static editor semantics for an esbuild plugin's attributed default import. */
export type ImportType = {
	type: string
	valueType: string
	attributes?: Record<string, true | readonly string[]>
}
