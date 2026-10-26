# dprint-plugin-galley-mdx

An independent MDX formatter for dprint, based on the official
[Markdown plugin 0.28.0](https://github.com/dprint/dprint-plugin-markdown/tree/0.28.0)
and the MDX project's [Rust parser](https://github.com/mdx-js/mdxjs-rs).

It formats ordinary Markdown while preserving MDX JavaScript and JSX. For example,
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
- JSX elements, JavaScript expressions, imports, exports, and YAML/TOML
  frontmatter are preserved verbatim. A top-level block containing MDX is
  preserved as a whole, including Markdown inside JSX, paragraphs with inline
  expressions, and lists or block quotes containing JSX. This first version does
  not reformat JavaScript or JSX itself.
- GitHub-flavored Markdown is supported, including tables and task lists.
- Fenced code can be formatted by other plugins registered with the dprint host.
  Set `codeBlock.skipFormat` to `true` to preserve it instead. JavaScript **inside
  MDX syntax** is always preserved.
- The complete result is reparsed as MDX. If Markdown formatting would produce
  invalid MDX or change its syntax tree, the original document is returned.
  Source positions, soft line wrapping, and intentionally formatted fenced code
  contents are excluded from this comparison. This conservative check can leave
  some otherwise formattable documents unchanged.
- Separators next to preserved blocks retain their original line endings and
  blank lines. Formatting settings affect the Markdown portions only.
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
