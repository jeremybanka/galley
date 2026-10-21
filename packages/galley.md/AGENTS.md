# galley.md

Compile trusted MDX documents and executable components to checked-in Markdown.

- Use `galley write [input] [output]` to generate Markdown and `galley check [input] [output]` to detect drift. The default input is `README.mdx`; the default output replaces the input extension with `.md`.
- Import source examples with `with { type: "code", lang: "ts" }`. The language defaults to the file extension. Code imports read the file without executing it.
- Components return Markdown nodes, text, elements, or promises of those values. Use `Markdown` to parse generated Markdown and `Code` to create fenced source examples.
- Use native `table`, `thead`, `tbody`, `tr`, `th`, and `td` tags for generated Markdown tables. Start with one `th` header row, use `td` body rows with matching cell counts, and set column alignment with `align="left"`, `"center"`, or `"right"` on `th`. Cells accept inline content; merged cells, styling, captions, footers, and block content are errors.
- Use the component's second argument, `DocumentContext`, for paths relative to its containing document. Imported MDX documents get their own directory context.
- Pass esbuild plugins through `compileMarkdown(input, { plugins })` or `runGalley`. Custom plugins run before built-in handlers and can consume arbitrary import attributes using esbuild's native module identity.
- Ordinary document imports and components execute during compilation. Only compile documents and plugins you trust.
- Install the npm-shipped VS Code extension with `galley vsix [editor]`, or build it with `galley vsix build [outputDirectory]`. Select the **galley.md** language for `.mdx` documents. The VSIX includes the pinned TypeScript 7.1 runtime for the current platform.
- Register `{ "package": "galley.md", "extensions": [".mdx"] }` in `tsconfig.json`'s `contentMappers` array for configured projects. CLI type checking requires TypeScript 7.1 and `--runExternalCode`.
- Component output appears as ghost summaries, full Markdown hovers, and native inline peek views. Preview refresh evaluates on open/save or explicit refresh, clears stale output on edit, and only runs in trusted workspaces. Separate preview processes have a timeout and are not security sandboxes.
- Describe plugin import types with the mapper's `options.importTypes`. Build hooks remain esbuild plugins; editor metadata never executes those hooks.
