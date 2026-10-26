# galley.md for VS Code

TypeScript 7.1 intelligence for MDX that compiles to plain Markdown.

Install from the npm package with `galley vsix`. Select **galley.md** as the document language if another MDX extension owns the file association. The language server includes its pinned TypeScript compiler; a separate TypeScript extension is unnecessary.

Import/export blocks, brace expressions, and expression props support TypeScript, including type imports, `as`, and `satisfies`. Their TSX projection provides checking, hover, rename, and navigation. Direct JSX children retain Markdown highlighting. Native Markdown tags and built-in components have explicit props; use `Html.Element` for HTML-specific attributes and custom tags.

Code and raw text imports understand `with { type: "code", lang: "ts" }` and `with { type: "text" }`. Components have faded output summaries, full Markdown on hover, and **Peek Generated Markdown** actions that open a read-only preview beneath their source. Component previews evaluate on open and save; **galley.md: Refresh Component Output** also evaluates unsaved document text. Editing clears stale output. Toggle `galley.preview.enabled` to disable evaluation.

For projects with a tsconfig, register the mapper:

```json
{
	"contentMappers": [{ "package": "galley.md", "extensions": [".mdx"] }]
}
```

Previews execute the document and its imports. They run in a separate process with a timeout, only in trusted workspaces. That process is not a sandbox. The extension never inserts generated output into the source file.
