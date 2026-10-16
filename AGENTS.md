# md-x

Compile trusted MDX documents and executable components to checked-in Markdown.

- Use `md-x write [input] [output]` to generate Markdown and `md-x check [input] [output]` to detect drift. The default input is `README.mdx`; the default output replaces the input extension with `.md`.
- Import source examples with `with { type: "code", lang: "ts" }`. The language defaults to the file extension. Code imports read the file without executing it.
- Components return Markdown nodes, text, elements, or promises of those values. Use `Markdown` to parse generated Markdown and `Code` to create fenced source examples.
- Use the component's second argument, `DocumentContext`, for paths relative to its containing document. Imported MDX documents get their own directory context.
- Pass esbuild plugins through `compileMarkdown(input, { plugins })` or `runMdX`. Custom plugins run before built-in handlers and can consume arbitrary import attributes using esbuild's native module identity.
- Ordinary document imports and components execute during compilation. Only compile documents and plugins you trust.
