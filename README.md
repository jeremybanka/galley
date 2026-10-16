# md-x

Compile MDX components and source imports into plain Markdown for GitHub, npm, and checked-in documentation.

```sh
pnpm add -D md-x
```

Create `README.mdx`:

```mdx
import Example from "./examples/basic.ts" with { type: "code", lang: "ts" }

# My package

## Example

<Example />
```

Run `md-x write` to generate `README.md`. Run `md-x check` in CI to exit nonzero when the output is missing or stale. Check never writes the output. Both commands evaluate the document anew.

Pass an input and optional output path explicitly:

```sh
md-x write docs/guide.mdx docs/guide.md
md-x check docs/guide.mdx docs/guide.md
```

Without an output argument, md-x replaces the input extension with `.md`. CLI paths are relative to the working directory. The output must differ from the input. Use `--` before paths that begin with a dash.

## Source imports

`type: "code"` reads the original file and exports a component. It never executes the source, removes types, or reformats it. `lang` overrides the language inferred from the file extension. md-x chooses fences that safely contain any backticks in the source.

The same file can be imported with different attributes to create distinct components. Identical attribute maps reuse the same component regardless of key order. The built-in code handler accepts `type` and `lang`; unknown attributes are errors. esbuild also supports `type: "text"` for importing a string you can use in an expression or pass as a prop.

## Components

Components can be async and return Markdown nodes directly. For example, `components.ts`:

```ts
import type { Component } from "md-x"

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

For TSX components, set `jsx` to `react-jsx` and `jsxImportSource` to `md-x` in TypeScript configuration. React is not required. Supported intrinsic JSX elements are `p`, `h1` through `h6`, `strong`, `em`, `del`, `blockquote`, `a`, `br`, and `hr`. Other tags are errors; use Markdown syntax or return Markdown nodes for other structures.

## Tonnage

```sh
pnpm add -D tonnage
```

```mdx
import { Tonnage } from "tonnage/md-x"
import config from "./tonnage.config.ts"
import Example from "./examples/basic.ts" with { type: "code", lang: "ts" }

# My package

<Example />

<Tonnage config={config} />
```

Tonnage resolves config paths relative to the containing document and returns the bundle report. Pass `directory` to measure another package. The component does not require README section markers or write a report file itself.

## Programmatic API and plugins

```ts
import { compileMarkdown, runMdX } from "md-x"

const markdown = await compileMarkdown("README.mdx")
const result = await runMdX("README.mdx", { mode: "check" })
console.log(markdown, result.changed)
```

Both functions accept a `plugins` array of esbuild plugins. Plugins run before the built-in handlers, so they can define their own import attributes. Access attributes through `args.with` in `onResolve` and `onLoad`. esbuild maintains separate modules for each distinct attribute combination.

md-x preserves Markdown syntax trees, including tables, task lists, references, and footnotes. It evaluates components and serializes those trees directly to Markdown; output formatting is normalized. Ordinary package imports remain external and resolve from the importing file. Local TypeScript and TSX dependencies are bundled. Documents, ordinary imports, and plugins execute with Node.js access, so compile trusted inputs.

Requires Node.js 22.18 or newer.
