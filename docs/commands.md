# Repository commands

Run commands from the repository root. The publishable package lives in `packages/galley.md`; the root package is private. `mise.toml` selects the Node and pnpm versions.

| Command            | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `build`            | Build the compiler, CLI, content mapper, and language server. |
| `fmt`              | Apply formatting.                                             |
| `check`            | Run formatting, spelling, lint, and TypeScript checks.        |
| `check:fmt`        | Validate formatting.                                          |
| `check:spelling`   | Validate spelling.                                            |
| `check:vp`         | Run lint and TypeScript checks through Vite Plus.             |
| `test`             | Run the test suite once.                                      |
| `test:watch`       | Watch the test suite.                                         |
| `change`           | Author release notes.                                         |
| `release:version`  | Prepare versions and release metadata.                        |
| `release:publish`  | Build and publish the npm package.                            |
| `staged`           | Format and check staged files.                                |
| `workflows:update` | Update pinned workflow tooling references.                    |

The package's `prepare` script builds source installations. Published npm packages include the built files.

Test examples live in `packages/galley.md/__tests__/fixtures/`. Import their source as text using import attributes:

```ts
import example from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
```

The test-only Vite plugin uses esbuild's native import-attribute handling to read these files without compiling or executing them. TypeScript resolves `#fixtures/*` to a string declaration. Tests copy the strings into temporary projects so relative imports, source changes, and file-system checks still run against isolated files. Fixture dependencies use the same text imports.

Fixtures preserve their exact bytes, including leading blank lines, missing final newlines, and intentionally invalid syntax. Formatting, linting, and direct type checking exclude the fixture directory; spelling checks still apply. Keep expected errors and focused output assertions in the test files. Larger expected Markdown documents can live alongside their input fixtures.

To build a VSIX after `pnpm build`, run `node packages/galley.md/dist/cli.mjs vsix build artifacts/editor`. To install it, run `node packages/galley.md/dist/cli.mjs vsix [editor]`.

For the initial `0.0.0` npm publication, run `pnpm build`, then `pnpm --filter galley.md publish`. `release:version` applies pending changesets and advances the version.
