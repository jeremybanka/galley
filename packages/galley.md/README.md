# galley.md

Compose your Markdown.

Compile MDX components and source imports into plain Markdown for GitHub, npm, and checked-in documentation.

```sh
pnpm add -D galley.md
```

Create `README.mdx`:

```mdx
import Example from "./examples/basic.ts" with { type: "code", lang: "ts" }

# My package

## Example

<Example />
```

Run `galley write` to generate `README.md`. Run `galley check` in CI to exit nonzero when the output is missing or stale. Check never writes the output. Both commands evaluate the document anew.

Pass an input and optional output path explicitly:

```sh
galley write docs/guide.mdx docs/guide.md
galley check docs/guide.mdx docs/guide.md
```

Without an output argument, galley.md replaces the input extension with `.md`. CLI paths are relative to the working directory. The output must differ from the input. Use `--` before paths that begin with a dash.

## Source imports

`type: "code"` reads the original file and exports a component. It never executes the source, removes types, or reformats it. `lang` overrides the language inferred from the file extension. galley.md chooses fences that safely contain any backticks in the source.

The same file can be imported with different attributes to create distinct components. Identical attribute maps reuse the same component regardless of key order. The built-in code handler accepts `type` and `lang`; unknown attributes are errors. esbuild also supports `type: "text"` for importing a string you can use in an expression or pass as a prop.

## Components

Components can be async and return Markdown nodes directly. For example, `components.ts`:

```ts
import type { Component } from "galley.md"

export const Greeting: Component<{ name: string }> = async ({ name }) => {
	await Promise.resolve()
	return {
		type: "paragraph",
		children: [{ type: "text", value: `Hello, ${name}!` }],
	}
}
```

Import and use it in MDX:

```mdx
import { Greeting } from "./components.ts"

<Greeting name="Ada" />
```

Use `Markdown({ children: generatedMarkdown })` to include Markdown produced by another tool. Use `Code({ source, lang })` to return a code node. Strings returned by components are text, escaped by the Markdown serializer. Components on their own line produce blocks; components within prose produce inline content.

The second argument is a `DocumentContext` with absolute `path` and `directory` fields for the containing document. Use this directory to resolve local inputs. Imported `.mdx` documents get their own context; `.md` imports are parsed as ordinary Markdown.

For TSX components, set `jsx` to `react-jsx` and `jsxImportSource` to `galley.md` in TypeScript configuration. React is not required. Outside an `Html` boundary, supported intrinsic JSX elements are `p`, `h1` through `h6`, `strong`, `em`, `del`, `blockquote`, `a`, `br`, `hr`, `table`, `thead`, `tbody`, `tr`, `th`, and `td`. They produce Markdown nodes. Wrap markup in `Html` to preserve HTML tags and attributes.

## Tables

Use native table tags to generate a Markdown table. No imports are required. Set `align="left"`, `"center"`, or `"right"` on a header cell to align its entire column; omit it for default alignment.

```mdx
export const packages = [{ name: "galley.md", size: "12 kB" }]

<table>
  <thead>
    <tr><th>Package</th><th align="right">Size</th></tr>
  </thead>
  <tbody>
    {packages.map(pkg => (
      <tr><td>{pkg.name}</td><td>{pkg.size}</td></tr>
    ))}
  </tbody>
</table>
```

This produces:

```md
| Package   |  Size |
| --------- | ----: |
| galley.md | 12 kB |
```

The first row must contain only `th` cells, and every subsequent row must contain only `td` cells. Every row must have the same number of cells; use `<td />` for an empty cell. A table may contain just its header. The `thead` and `tbody` wrappers are optional: rows can be direct children of `table`. When present, `thead` must contain exactly one header row and `tbody` may contain only body rows.

Arrays, fragments, and async components can generate sections, rows, cells, or inline cell content. Cells support text, numbers, links, emphasis, and other Markdown inline content. Strings are escaped automatically, including pipe characters. A single paragraph is accepted, and soft line breaks become spaces.

Table attributes are checked during rendering because these JSX tags also support HTML attributes inside an `Html` boundary. Unsupported structures and attributes produce errors. Tables do not support merged cells (`colSpan` or `rowSpan`), captions, footers (`tfoot`), `col` or `colgroup`, CSS classes or styles, or attributes other than header `align` and JSX `key`. Put alignment on `th`, not `td` or `tr`. Lists, code blocks, multiple paragraphs, nested tables, raw HTML, and hard line breaks inside cells cannot be represented by this Markdown table API.

## HTML

Use `Html` for markup such as centered branding, badges, and layout tables:

```mdx
import { Html } from "galley.md"

<Html>
  <div align="center">
    <img src="logo.png" alt="My package" width={160} height={160} />
    <h1 align="center"><code>my-package</code></h1>
  </div>
  <table>
    <tbody><tr><td>Markup table</td><td>Custom layout</td></tr></tbody>
  </table>
</Html>

| Markdown table | Value |
| --- | --- |
| Bundle size | 500 B |
```

`Html` adds no wrapper tag. Its descendants render as HTML, including nested components, async results, and Markdown nodes. A `<table>` inside `Html` stays an HTML table; a Markdown table outside stays a Markdown table. Ordinary Markdown formatting inside the boundary converts to HTML too.

Text and attribute values are HTML-escaped. Attributes accept strings, numbers, booleans, and arrays of strings or numbers; null and undefined omit the attribute. HTML names such as `class` and `colspan` work, as do JSX names such as `className`, `htmlFor`, and `colSpan`. Use a CSS string for `style`. HTML void elements such as `img` and `br` need no closing tag in the generated Markdown, but use self-closing JSX syntax in MDX. This produces static markup, so event-handler functions and style objects are unsupported.

Use `Markdown` for strings containing generated Markdown. Strings passed to `Html` are text, so write markup as JSX children rather than an HTML string. Existing raw HTML in Markdown nodes is preserved; `Html` does not sanitize it.

## Tonnage

```sh
pnpm add -D tonnage
```

```mdx
import { Tonnage } from "tonnage/galley"
import config from "./tonnage.config.ts"
import Example from "./examples/basic.ts" with { type: "code", lang: "ts" }

# My package

<Example />

<Tonnage config={config} />
```

Tonnage resolves config paths relative to the containing document and returns the bundle report. Pass `directory` to measure another package. The component does not require README section markers or write a report file itself.

## Programmatic API and plugins

```ts
import { compileMarkdown, runGalley } from "galley.md"

const markdown = await compileMarkdown("README.mdx")
const result = await runGalley("README.mdx", { mode: "check" })
console.log(markdown, result.changed)
```

Both functions accept a `plugins` array of esbuild plugins. Plugins run before the built-in handlers, so they can define their own import attributes. Access attributes through `args.with` in `onResolve` and `onLoad`. esbuild maintains separate modules for each distinct attribute combination.

galley.md preserves Markdown syntax trees, including tables, task lists, references, and footnotes. It evaluates components and serializes those trees directly to Markdown; output formatting is normalized. Ordinary package imports remain external and resolve from the importing file. Local TypeScript and TSX dependencies are bundled. Documents, ordinary imports, and plugins execute with Node.js access, so compile trusted inputs.

Requires Node.js 22.18 or newer.

## Editor support

The npm package includes the TypeScript 7.1 content mapper, the `galley-lsp` language server, and the VS Code extension sources. Build and install the extension with the official CLI:

```sh
galley vsix
galley vsix cursor
```

The optional argument selects the editor's CLI executable; it defaults to `code`. To build a VSIX without installing it, run `galley vsix build [outputDirectory]`. The default output directory is `artifacts`. The VSIX includes the pinned TypeScript compiler and native dependencies for the platform where it was built, so it does not depend on a separate TypeScript extension or a Marketplace release.

Choose **galley.md** as the file's language if another MDX extension owns `.mdx`. To make that association persistent, set `"files.associations": { "*.mdx": "galley" }` in workspace settings.

Components display faded summaries of their generated Markdown next to the source. Hover over a component to read its full output, or use its **Peek Generated Markdown** action to open a read-only view directly beneath it. VS Code's stable native editor does not support persistent multiline ghost blocks; summaries, hovers, and inline peek views keep the preview in the native editing experience.

Previews refresh when a document opens, is saved, or a known source dependency changes. Editing immediately clears stale output. **galley.md: Refresh Component Output** evaluates the current unsaved MDX text without writing it to disk. Disable `galley.preview.enabled` to stop automatic evaluation. Preview errors appear in the **galley.md** output channel.

The extension runs only in trusted workspaces. Each preview evaluates the document in a separate process with a 15-second timeout. Components execute once per preview, and the captured output uses the same Markdown serializer as `galley write`. The process isolates crashes and console output; it is not a security sandbox. Previews can execute the same side effects as a build.

For other editors, run `galley-lsp --stdio` (or `galley lsp`) using the `galley` language ID for `.mdx` files. The server provides TypeScript completions, diagnostics, hover, rename, navigation, and import-attribute assistance. The custom `galley/preview` request accepts `{ "uri": "file:///.../README.mdx" }` for an open document and returns its document version, complete Markdown, component source offsets and output, and known dependencies. Enable evaluation explicitly with `initializationOptions.preview: true` only for trusted projects.

## TypeScript content mapper

The editor server bundles TypeScript `7.1.0-dev.20261014.1`. The same content mapper works with that version for command-line checking. TypeScript 7.1 is still prerelease; the version is pinned to the tested protocol.

Register the mapper in your project's `tsconfig.json`:

```json
{
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"jsx": "react-jsx",
		"jsxImportSource": "galley.md",
		"module": "nodenext",
		"noEmit": true
	},
	"contentMappers": [{ "package": "galley.md", "extensions": [".mdx"] }],
	"include": ["**/*.ts", "**/*.tsx", "**/*.mdx"]
}
```

Then run TypeScript 7.1's `tsc --runExternalCode`. A configured project needs this registration for the editor too; files outside a configured project receive the mapper from the language server automatically. MDX syntax remains JavaScript and JSX; component implementation files can use TypeScript.

The mapper understands code imports as components, text imports as strings, and ordinary TypeScript imports using their actual exports. Each attributed binding gets its own type projection, so importing one file both normally and with different attributes never changes the original module's types. Source mappings retain UTF-16 offsets for diagnostics and renames, including documents containing emoji.

Plugins can describe the static type and supported attributes of their attributed default imports through mapper options, without executing their esbuild hooks during editing:

```json
{
	"contentMappers": [{
		"package": "galley.md",
		"extensions": [".mdx"],
		"options": {
			"importTypes": [{
				"type": "my-component",
				"valueType": "typeof import('./components').MyComponent",
				"attributes": { "variant": ["small", "large"] }
			}]
		}
	}]
}
```

`valueType` is a TypeScript type expression resolved from the MDX document. An attribute value of `true` accepts any string; an array limits the allowed values. The corresponding esbuild plugin still owns build behavior and must be supplied through the programmatic API. This metadata supplies type checking and attribute diagnostics; it does not install or execute a plugin or configure previews to use it.

Use `previewMarkdown(input, { source, plugins })` programmatically to capture component output from unsaved source. It returns `{ markdown, components, dependencies }`; each component has `file`, `start`, `end`, and `markdown` fields. Offsets refer to the original source, and imported documents retain their own file and directory context.
