# galley.md

Compose your Markdown.

Compile MDX components and source imports into plain Markdown for GitHub, npm, and checked-in documentation.

```sh
pnpm add -D galley.md
```

Create `README.mdx`:

<!-- dprint-ignore -->
```mdx
import Example from "./examples/basic.ts" with { type: "code", lang: "ts" }

# My package

## Example

<Example />
```

Run `galley write` to generate `README.md`. Run `galley check` in CI to exit nonzero when the output is missing or stale. Check never writes the output. Both commands evaluate the document anew.

Run `galley`, `galley -h`, `galley --help`, or `galley help` for command usage. The help option is registered only on the root command.

Galley formats generated Markdown with aligned tables, consistent emphasis, and list indentation. The CLI, API, and editor previews share the same defaults, powered by pinned dprint dependencies included with Galley. No additional installation or formatting configuration is needed.

Source code blocks, raw HTML, and YAML frontmatter retain their contents. Galley does not run embedded language formatters or read project formatting settings.

Pass an input and optional output path explicitly:

```sh
galley write docs/guide.mdx docs/guide.md
galley check docs/guide.mdx docs/guide.md
```

Without an output argument or frontmatter setting, galley.md replaces the input extension with `.md`. Explicit CLI paths are relative to the working directory (or absolute filesystem paths). The output must differ from the input. Use `--` before paths that begin with a dash.

## Output frontmatter

Set `galley.output` in YAML frontmatter to keep a document's destination with its source:

<!-- dprint-ignore -->
```mdx
---
title: My package
galley:
  output: /README.md
---

# My package
```

Run `galley write docs/README.mdx` to write this document to `README.md` at the Git repository root. Run `galley check docs/README.mdx` to check the same destination.

| Output setting | Destination                                                        |
| -------------- | ------------------------------------------------------------------ |
| `guide.md`     | Beside the source document.                                        |
| `../guide.md`  | Relative to the source document's directory.                       |
| `/README.md`   | Relative to the nearest Git repository root containing the source. |

A leading `/` in frontmatter means the repository root, not the filesystem root. Galley finds the nearest ancestor containing a `.git` directory or file, including worktrees and submodules. Repository-root paths must stay within that root and fail if no repository is found. Use forward slashes for portable paths.

An explicit CLI output argument or `runGalley`'s `output` option overrides frontmatter. Without either override, Galley uses `galley.output`, then falls back to replacing the source extension with `.md`. `write` creates missing destination directories; `check` never creates files or directories.

Frontmatter must be a YAML mapping, and `galley.output` must be a nonempty literal path string. Galley removes the `galley` mapping from generated Markdown and preserves other frontmatter, including `title` above. If only Galley settings remain, it omits the frontmatter block entirely. Imported documents have their Galley settings removed too, but their destinations never cause additional writes. `compileMarkdown` and editor previews render content without resolving or writing any destination.

## Source imports

`type: "code"` reads the original file and exports a component. It never executes the source, removes types, or reformats it. `lang` overrides the language inferred from the file extension. galley.md chooses fences that safely contain any backticks in the source.

The same file can be imported with different attributes to create distinct components. Identical attribute maps reuse the same component regardless of key order. The built-in code handler accepts `type` and `lang`; unknown attributes are errors. esbuild also supports `type: "text"` for importing a string you can use in an expression or pass as a prop.

## TypeScript in MDX

Galley extends MDX's existing code regions with TypeScript and TSX. This is a Galley dialect: standard MDX tools do not necessarily accept its TypeScript syntax.

- Module blocks start with `import` or `export`. Type imports, import attributes, exported type/interface declarations, and typed `export const` declarations are supported.
- `{expression}`, `prop={expression}`, and `{...spread}` accept TypeScript expressions, including `as`, `satisfies`, generics, and nested TSX.
- Outside those regions, the document is Markdown. Direct JSX element children remain Markdown; JSX inside a TypeScript expression follows TSX rules. Code fences are examples, not executable regions.
- A blank line ends a complete module block. Blank lines inside an unfinished declaration, string, comment, or nested expression do not end it. Bare top-level `const`, `type`, and `interface` declarations are prose; use exported declarations or a separate `.ts` file.

<!-- dprint-ignore -->
```mdx
import { Html, type Content } from "galley.md"

export type Size = { width: number }
export const size = { width: 160 } satisfies Size
export const Label = ({ value }: { value: string }): Content => <strong>{value}</strong>

<Html.Element tag="img" attributes={{ ...size, alt: "Logo" }} />

<Label value={`${size.width as number}px`} />
```

Compilation erases types; it does not typecheck them. The TypeScript 7.1 content mapper below checks the original source as TSX and maps diagnostics and editor actions back to MDX. An exported `Props` type or interface declares a document's props. Move reusable logic into `.ts` or `.tsx` files.

To format authored `.mdx`, use the separate [dprint-plugin-galley-mdx](../dprint-plugin-galley-mdx/README.md) plugin. It owns its TypeScript formatter dependency and needs no peer language plugin. This is separate from Galley's built-in formatting of generated `.md` output.

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

<!-- dprint-ignore -->
```mdx
import { Greeting } from "./components.ts"

<Greeting name="Ada" />
```

Use `Markdown({ children: generatedMarkdown })` to include Markdown produced by another tool. Use `Code({ source, lang })` to return a code node. Strings returned by components are text, escaped by the Markdown serializer. Components on their own line produce blocks; components within prose produce inline content.

Use `Comment` for HTML comments that should remain in the generated Markdown:

<!-- dprint-ignore -->
```mdx
import { Comment } from "galley.md"

<Comment>Generated from README.mdx. Run pnpm readme:write to update.</Comment>
```

This emits `<!-- Generated from README.mdx. Run pnpm readme:write to update. -->`. Children render as Markdown with surrounding whitespace trimmed; expressions and multiline content work too. `Comment` also works inside `Html`. Children cannot contain HTML comment delimiters (`<!--`, `-->`, or `--!>`). Use ordinary MDX comments, `{/* ... */}`, for notes that should stay out of the generated document.

The second argument is a `DocumentContext` with absolute `path` and `directory` fields for the containing document. Use this directory to resolve local inputs. Imported `.mdx` documents get their own context; `.md` imports are parsed as ordinary Markdown.

For TSX components, set `jsx` to `react-jsx` and `jsxImportSource` to `galley.md` in TypeScript configuration. React is not required. Outside an `Html` boundary, supported intrinsic JSX elements are `p`, `h1` through `h6`, `strong`, `em`, `del`, `blockquote`, `a`, `br`, `hr`, `table`, `thead`, `tbody`, `tr`, `th`, and `td`. They produce Markdown nodes. Use `Html.Element` for HTML-specific tags and attributes.

## Tables

Use native table tags to generate a Markdown table. No imports are required. Set `align="left"`, `"center"`, or `"right"` on a header cell to align its entire column; omit it for default alignment.

<!-- dprint-ignore -->
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

Native table attributes are checked by TypeScript and during rendering, including properties introduced through spreads. Unsupported structures and attributes produce errors. Tables do not support merged cells (`colSpan` or `rowSpan`), captions, footers (`tfoot`), `col` or `colgroup`, CSS classes or styles, or attributes other than header `align` and JSX `key`. Put alignment on `th`, not `td` or `tr`. Lists, code blocks, multiple paragraphs, nested tables, raw HTML, and hard line breaks inside cells cannot be represented by this Markdown table API.

## HTML

Use `Html.Element` for HTML-specific tags, attributes, custom elements, and layout tables. Its props are `tag`, optional `attributes`, and optional `children`; the attribute dictionary is the explicit HTML escape hatch:

<!-- dprint-ignore -->
```mdx
import { Html } from "galley.md"

<Html.Element tag="div" attributes={{ align: "center" }}>
  <Html.Element tag="img" attributes={{ src: "logo.png", alt: "My package", width: 160 }} />
  <h1>My package</h1>
</Html.Element>

<Html.Element tag="custom-badge" attributes={{ "data-label": "example" }} />
```

`Html.Element` renders its descendants as HTML. `Html` remains a wrapper-free HTML boundary for components and Markdown nodes. Text and attribute values are escaped. Attributes accept strings, numbers, booleans, and arrays of strings or numbers; null and undefined omit the attribute. HTML names such as `class` and `colspan` work, as do JSX names such as `className`, `htmlFor`, and `colSpan`. Use a CSS string for `style`; event-handler functions and style objects are unsupported.

Wrapping JSX in `Html` does not change its TypeScript prop types. Migrate HTML-only lowercase tags and attributes to `Html.Element`. Existing untyped markup inside `Html` still renders, but there is no catch-all JSX tag or property signature. Native Markdown tags accept their documented props, and `Component` without a type argument accepts no props. Built-in components reject unknown properties at runtime, including spreads. TypeScript's structural typing can still allow extra properties in spreads passed to user-defined components; validate those components when exact runtime props matter.

Strings passed to either HTML component are text. Use `Markdown` for strings containing generated Markdown. Existing raw HTML in Markdown nodes is preserved; these components do not sanitize it.

## Tonnage

```sh
pnpm add -D tonnage
```

<!-- dprint-ignore -->
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

Previews refresh when a document opens, is saved, or a known source dependency changes. While you edit expressions or tags, their peek actions and open preview documents stay available with the previous output clearly labeled. Preview anchors follow text edits without waiting for a complete syntax tree; deleting an entire region removes its action. A failed refresh retains previous output for the affected region until a successful evaluation replaces it. **galley.md: Refresh Component Output** evaluates the current unsaved MDX text without writing it to disk. Disable `galley.preview.enabled` to stop automatic evaluation. Syntax errors and failing components appear in **Problems** and the Galley status bar. Complete regions around a syntax error and independently rendered components keep working. Import or module initialization failures retain the previous output with a stale label; details also appear in the **galley.md** output channel.

The extension runs only in trusted workspaces. Each preview evaluates the document in a separate process with a 15-second timeout. Editor previews can show partial output after an error; the CLI and public compilation APIs still fail on invalid documents. Components execute once per preview, and the captured output uses the same Markdown serializer as `galley write`. The process isolates crashes and console output; it is not a security sandbox. Previews can execute the same side effects as a build.

For other editors, run `galley-lsp --stdio` (or `galley lsp`) using the `galley` language ID for `.mdx` files. The server provides TypeScript completions, diagnostics, hover, rename, navigation, and import-attribute assistance. The custom `galley/preview` request accepts `{ "uri": "file:///.../README.mdx" }` for an open document and returns its document version, Markdown, component source offsets and output, known dependencies, and an `errors` array containing `{ file, start, end, message }`. When errors are present, Markdown and component output are partial. Enable evaluation explicitly with `initializationOptions.preview: true` only for trusted projects.

## TypeScript content mapper

The editor server bundles TypeScript `7.1.0-dev.20261025.1`. The same content mapper works with that version for command-line checking. TypeScript 7.1 is still prerelease; the version is pinned to the tested protocol.

Register the mapper in your project's `tsconfig.json`:

```json
{
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"strict": true,
		"jsx": "react-jsx",
		"jsxImportSource": "galley.md",
		"module": "nodenext",
		"noEmit": true
	},
	"contentMappers": [{ "package": "galley.md", "extensions": [".mdx"] }],
	"include": ["**/*.ts", "**/*.tsx", "**/*.mdx"]
}
```

Then run TypeScript 7.1's `tsc --runExternalCode`. A configured project needs this registration for the editor too; files outside a configured project receive the mapper from the language server automatically. MDX code regions are checked as TSX, including types and component props.

The mapper selects Galley's JSX runtime for MDX even when the project's `jsxImportSource` is unset or points to another runtime. The `jsxImportSource` setting above is needed for your Galley TSX components.

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
