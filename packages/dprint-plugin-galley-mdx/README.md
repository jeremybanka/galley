# dprint-plugin-galley-mdx

An independent MDX formatter for dprint, based on the official
[Markdown plugin 0.28.0](https://github.com/dprint/dprint-plugin-markdown/tree/0.28.0)
with [markdown-rs](https://github.com/wooorm/markdown-rs) for MDX boundaries
and the official [TypeScript formatter](https://github.com/dprint/dprint-plugin-typescript)
for embedded TypeScript/TSX.

It formats ordinary Markdown and embedded code while preserving MDX syntax and literal values. For example,
`<svg width={160} />` retains a numeric expression prop; it never becomes
`<svg width="{160}" />`.

## Install

Once published, install the plugin alongside dprint:

```sh
pnpm add -D dprint dprint-plugin-galley-mdx
```

Add the WebAssembly plugin to `dprint.json`:

```json
{
	"lineWidth": 80,
	"plugins": ["./node_modules/dprint-plugin-galley-mdx/plugin.wasm"],
	"mdx": {
		"textWrap": "maintain"
	}
}
```

Run `pnpm exec dprint fmt`. The plugin matches `.mdx` files. It can coexist with
the official Markdown plugin for `.md` files. Remove `.mdx` from any explicit
`markdown.associations` setting so it reaches this plugin.

For a source checkout, run `mise install`, `pnpm install`, and `pnpm build:mdx`
from the repository root. The repository's dprint configuration already points
to the locally built plugin.

## Formatting behavior

- Markdown uses the upstream plugin's configuration and defaults, under the
  `mdx` configuration key. See the included `schema.json` for supported options.
- Imports, exports, expressions, expression props, and spreads are parsed as
  TypeScript/TSX and formatted by a bundled dprint TypeScript dependency.
  Type imports, import attributes, `as`, and `satisfies` are supported. No peer
  TypeScript formatter is required. Embedded code uses the MDX `lineWidth` and
  an owned dprint TypeScript policy: fit code on one line when possible, use
  consistent breaks in wrapped binary/conditional expressions and member chains,
  and always parenthesize arrow parameters. Statement bodies use a fixed placement.
  Existing line wrapping does not select the layout. Supplier formatting runs to
  a stable result within one operation, so the next save does not reflow it again.
- Code starts only at MDX's import/export and brace-expression boundaries. Bare
  top-level declarations remain prose. This TypeScript extension is Galley's
  dialect, not part of standard MDX.
- Self-closing tags without props use `<Name />`, including when their closing marker was on another line. Inline tags with props use one space before `/>`. Literal contents and ignored regions retain their spelling.
- Excess blank lines collapse to one blank line, including around MDX blocks.
  Repeated spaces and tabs in prose and between JSX attributes collapse to a
  single space. Padding around prop assignment markers is removed; blank lines between props collapse to a single line break. Multiline and parenthesized expressions lose excess boundary padding. Trailing spaces are removed, and documents end with one newline.
  Two-space Markdown hard breaks become backslash hard breaks.
- Quoted attribute values, code/string contents, YAML/TOML frontmatter, ignored
  regions, and whitespace-sensitive HTML elements (`pre`, `code`, `textarea`,
  `script`, and `style`) retain their whitespace. Markdown indentation and JSX
  structure are preserved. Noncontiguous code slices inside Markdown list/quote
  prefixes remain unchanged to avoid damaging those prefixes.
- GitHub-flavored Markdown is supported, including tables and task lists.
- Fenced code can be formatted by other plugins registered with the dprint host.
  Set `codeBlock.skipFormat` to `true` to preserve it instead. Executable MDX expressions use the bundled formatter.
- The complete result is reparsed as MDX. If Markdown formatting would produce
  invalid MDX or change its syntax tree, the original document is returned.
  Source positions, normalized prose whitespace, and intentionally formatted fenced code
  contents are excluded; embedded TypeScript is compared in canonical formatter form. This conservative check can leave
  some otherwise formattable documents unchanged.
- Invalid MDX produces an error. Range formatting currently returns the original
  text; use whole-document formatting.

Use MDX comments for ignore directives:

```mdx
{/* dprint-ignore */}
#   Keep this heading   #
```

Standalone top-level comments also support `dprint-ignore-file`,
`dprint-ignore-start`, and `dprint-ignore-end`. The corresponding configuration
options customize these names. Ignore-file still requires syntactically valid MDX.

## Distribution and source

The npm package exports `plugin.wasm`, `schema.json`, `manifest.json`, and
`package.json`. The manifest records the plugin's name, npm version, size, and
SHA-256 checksum. The Wasm-reported version comes from the npm manifest, so
Changesets releases do not require a second version edit in Cargo.

The package includes Rust source, the locked build recipe under `source/`,
dependency notices, and the source of MPL-covered Rust dependencies. To rebuild
from an unpacked package, place it at `packages/dprint-plugin-galley-mdx` in an
empty directory and copy its `source/{Cargo.toml,Cargo.lock,mise.toml,rustfmt.toml}`
to that directory's root. Run `mise install`, then:

```sh
mise exec -- cargo build --locked --release --target wasm32-unknown-unknown --features wasm -p dprint-plugin-galley-mdx
```

The output is `target/wasm32-unknown-unknown/release/dprint_plugin_galley_mdx.wasm`.

Galley's additions and modifications use MPL-2.0. Upstream MIT notices are
preserved; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [LICENSE](LICENSE),
and [LICENSE-MIT](LICENSE-MIT). Bundled dependency terms are included in
`DEPENDENCY_NOTICES.txt`. This is not an official dprint or MDX project.
