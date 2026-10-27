# Repository commands

Run commands from the repository root. The publishable packages live in `packages/galley.md` and `packages/dprint-plugin-galley-mdx`; the root package is private. `mise.toml` selects Node, pnpm, and Rust, including Clippy, rustfmt, and the `wasm32-unknown-unknown` target. Run `mise install` before installing dependencies.

| Command            | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `build`            | Build Galley and the dprint MDX WebAssembly plugin.                  |
| `build:mdx`        | Build only the MDX plugin, dependency notices, and source bundle.    |
| `check:rust`       | Run Clippy over the Rust library and regression tests.               |
| `fmt`              | Apply formatting.                                                    |
| `check`            | Run formatting, spelling, lint, and TypeScript checks.               |
| `check:fmt`        | Validate formatting.                                                 |
| `check:spelling`   | Validate spelling.                                                   |
| `check:mdx`        | Check the configured project with TypeScript 7.1 and its MDX mapper. |
| `check:vp`         | Run lint and TypeScript checks through Vite Plus.                    |
| `test`             | Run the test suite once.                                             |
| `test:public`      | Run the current consumer contracts against source once.              |
| `test:private`     | Run implementation and detailed regression tests once.               |
| `test:breakage`    | Replay the latest release's consumer contracts against source.       |
| `test:watch`       | Watch the test suite.                                                |
| `change`           | Author release notes.                                                |
| `release:version`  | Prepare versions and release metadata.                               |
| `release:publish`  | Build and publish the npm package.                                   |
| `staged`           | Format and check staged files.                                       |
| `workflows:update` | Update pinned workflow tooling references.                           |

Galley's `prepare` script builds source installations. Published npm packages include the built files.

Tests start in `packages/galley.md/__tests__/private/`. The lean `public/` suite protects selected consumer capabilities: Markdown structure, native tables, source import content and identity, async components and document context, custom import plugins, fresh dependency evaluation, write/check and CLI behavior, frontmatter destinations, and unsaved preview content and offsets. It is a selected contract, not exhaustive API coverage. Detailed editor protocols, generated TypeScript, exact error messages, serializer snapshots, and implementation assertions remain private.

Public tests import `galley.md`; the current Vite and TypeScript configuration map that name to source. The runner supplies `GALLEY_TEST_CLI` for subprocess tests. Update these current mappings when moving entrypoints. Public assertions use an independent Markdown parser, preserving content, code bytes, languages, and structure while allowing equivalent formatting. Exact source preservation and read-only checks deliberately compare bytes. Keep every fixture and expectation helper inside the restore pattern in `packages/galley.md/breakage.config.ts`; the fixture loader is restored too. Breakage resolves commands and restore paths from the package-local configuration directory. Changes to observer dependencies must keep released tests runnable.

`test:public` runs once without task caching or a self-build and fails if no tests are selected. `test` runs the formatter package first, then Galley's public and private suites together, so cold Rust compilation does not compete with the CLI and language-server tests. Galley's `test` and `test:private` commands build the MDX Wasm plugin before testing, including when invoked directly in that package. CI runs current tests and historical compatibility in separate jobs. The Vite Plus check job also runs `check:mdx` with the configured TypeScript content mapper. The workspace's uncached `test:breakage` delegates to the package script, which first runs `breakage prelude --out .breakage/baseline.json`, then `breakage breakage.config.ts --verbose --baseline-file .breakage/baseline.json`. These direct CLI calls discover the latest matching tag on `origin`, pin its commit in ignored `packages/galley.md/.breakage/baseline.json`, and let the pinned `breakage@0.10.0` restore released tests and helpers around the run. Run from a clean checkout with access to origin; do not cache the command.

The package's Breakage configuration uses `changesetsReleaseDelta()` and `semverPolicy({ beforeV1: "minor" })` to compare Galley's intended version with that exact baseline. A major increase certifies a failed released-contract check; before 1.0, a minor increase does too. The upstream helper reads Changesets' assembled release plan, falling back to the current manifest after changesets have been consumed. The pinned `@breakage/changesets` integration owns its Changesets dependencies. Patch releases and prerelease-identifier changes alone do not certify failures. Certification acknowledges a failed check under the release policy; it does not establish compatibility or diagnose the failure's cause. The test command's exit 1 reports incompatibility that release policy may permit; other nonzero exits and process failures are setup errors and cannot be certified. These exit codes are a reporting convention, not an automatic diagnosis. Current tests still have to pass independently.

Release `galley.md@0.1.6` contains the public contracts. Breakage must replay that suite from a clean checkout; missing-baseline failures remain inconclusive and must not be overridden.

Test examples live in `packages/galley.md/__tests__/fixtures/`. Import their source as text using import attributes:

```ts
import example from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
```

The test-only Vite plugin uses esbuild's native import-attribute handling to read these files without compiling or executing them. Modules importing fixtures bypass Vitest's persistent transform cache so fixture-only edits cannot reuse stale inlined contents. TypeScript resolves `#fixtures/*` to a string declaration. Tests copy the strings into temporary projects so relative imports, source changes, and file-system checks still run against isolated files. Fixture dependencies use the same text imports.

Ordinary fixtures participate in `fmt`, `check:fmt`, and VS Code formatting on save. Keep format-sensitive cases excluded in `dprint.json`; adding a fixture does not automatically exempt it. The current exceptions, relative to `packages/galley.md/__tests__/fixtures/`, are:

| Fixture                                                            | Why formatting is excluded                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `mdx-plugin/**`                                                    | Deliberately unformatted input, ignore directives, invalid syntax, whitespace, and CRLF cases for the formatter itself. |
| `**/*.expected.md`                                                 | Expected output must remain an independent assertion, not be rewritten by the formatter.                                |
| `compiler/embedded-examples.mdx`                                   | Verifies exact preservation of embedded code whitespace.                                                                |
| `compiler/markdown-formatting.mdx`                                 | Unformatted input verifies that compilation and previews apply Markdown formatting.                                     |
| `frontmatter/invalid-yaml.mdx`, `frontmatter/duplicate-output.mdx` | Malformed metadata and duplicate keys must remain invalid.                                                              |
| `frontmatter/multiline.mdx`                                        | Literal YAML scalar trailing blank lines carry meaning.                                                                 |
| `editor/incomplete-import.mdx`, `editor/recovery.mdx`              | Incomplete and broken MDX exercise editor recovery.                                                                     |
| `editor/highlighting.mdx`, `editor/typed.mdx`                      | Deliberate blank lines inside TypeScript test parser and highlighting boundaries.                                       |
| `editor/typed-formatting.mdx`                                      | Unformatted TypeScript MDX is checked before and after formatting.                                                      |

Keep runtime/type-error fixtures formatted when their syntax is valid. Compose fixture fragments with explicit separators in the test harness; do not rely on leading blank lines that formatters remove. Editor assertions should locate positions in fixture text rather than freeze incidental line numbers or quote styles. All fixtures remain excluded from linting and direct project type checking because they run in temporary test projects; spelling checks still apply. Keep expected errors and focused output assertions in the test files. Larger expected Markdown documents can live alongside their input fixtures.

Keep the user guide's `dprint-ignore` comments before MDX examples. The Markdown plugin treats embedded MDX as Markdown and can rewrite JSX expressions as literal HTML attribute strings. The rest of the guide remains formatted normally.

To build a VSIX after `pnpm build`, run `node packages/galley.md/dist/cli.mjs vsix build artifacts/editor`. To install it, run `node packages/galley.md/dist/cli.mjs vsix [editor]`.

The workspace associates `.mdx` files with the **galley.md** language. Install the Galley extension using the command above so fixtures use Galley's JSX runtime and import handling in the editor. The root `tsconfig.json` registers the Galley content mapper and includes authored MDX; `pnpm check:mdx` enables external mapper execution. Fixtures remain excluded from direct project type checking. Declaration packaging uses `tsconfig.build.json` with no content mappers, since it builds only TypeScript and must not execute the mapper being packaged.

Workspace settings enable dprint formatting on save and recommend the dprint extension. Run `pnpm build:mdx` after installing dependencies to provide its local Wasm plugin. The formatter uses `dprint.json`, including its fixture exclusions. Rebuild and reinstall the VSIX after changing editor or parser code, then reload the VS Code window to load the new bundle.

For the initial `0.0.0` npm publication, run `pnpm build`, then `pnpm --filter galley.md publish`. `release:version` applies pending changesets and advances the version.

## Maintaining the dprint MDX plugin

`fmt` and `check:fmt` build the plugin before dprint loads it, and run rustfmt for Rust sources. The root `test` command includes the imported Markdown formatter/parser regression suites and WebAssembly integration tests observed with the independent JavaScript MDX parser. The existing Breakage command continues to cover the `galley.md` API; the new plugin has no released contract baseline yet.

The fork starts at dprint-plugin-markdown 0.28.0, commit `a49e479f3e38c18ea915a4b68708bcd69894b245`. Keep its attribution and MIT license intact when merging upstream changes. The added MDX adapter is `src/mdx.rs`; `src/wasm_plugin.rs` supplies the independent identity, MDX-only matching, and adapter routing. The original Markdown formatter and parser remain covered by the imported `tests/` corpus. Its exact whitespace must not be formatted.

The build generates `plugin.wasm`, a checksum manifest, `DEPENDENCY_NOTICES.txt`, and `source/` inside the package. They are ignored locally and included in the npm archive. Missing dependency license texts fail the build. The `licenses/` directory supplies the repository licenses omitted by some crate archives: Nugine/simd (`LICENSE`, blob `2c7eabb59093ea117d73b20effdd0414f87b2af2`), swc-project/swc (`LICENSE`, blob `6a08504909fe063aedf79b9113c240dec13858d5`), and dudykr/ddbase (`LICENSE`, blob `7a4a3ea2424c09fbe48d455aed1eaa94d9124835`). Verify these when updating their crates. MPL dependency source is also included.

The MDX adapter uses markdown-rs with TypeScript parsing callbacks in `src/typescript.rs`. The bundled official dprint TypeScript formatter shares its SWC parser through deno_ast. Keep parser versions aligned with the formatter and run the shared TypeScript fixtures through compilation, typechecking, WASM formatting, and editor highlighting when upgrading. The supplemental MIT notices for capacity_builder_macros and deno_error_macro come from their sibling crate licenses; dprint-swc-ext comes from its 0.26.1 repository tag.

Changesets owns the plugin's npm version. The Wasm metadata reads the included `package.json`; the private, unpublished Rust crate version is not a second release counter. Before publishing, build the workspace and inspect `pnpm --filter dprint-plugin-galley-mdx pack` for the Wasm, manifest, sources, and license notices.
