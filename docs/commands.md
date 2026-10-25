# Repository commands

Run commands from the repository root. The publishable package lives in `packages/galley.md`; the root package is private. `mise.toml` selects the Node and pnpm versions.

| Command            | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `build`            | Build the compiler, CLI, content mapper, and language server.  |
| `fmt`              | Apply formatting.                                              |
| `check`            | Run formatting, spelling, lint, and TypeScript checks.         |
| `check:fmt`        | Validate formatting.                                           |
| `check:spelling`   | Validate spelling.                                             |
| `check:vp`         | Run lint and TypeScript checks through Vite Plus.              |
| `test`             | Run the test suite once.                                       |
| `test:public`      | Run the current consumer contracts against source once.        |
| `test:private`     | Run implementation and detailed regression tests once.         |
| `test:breakage`    | Replay the latest release's consumer contracts against source. |
| `test:watch`       | Watch the test suite.                                          |
| `change`           | Author release notes.                                          |
| `release:version`  | Prepare versions and release metadata.                         |
| `release:publish`  | Build and publish the npm package.                             |
| `staged`           | Format and check staged files.                                 |
| `workflows:update` | Update pinned workflow tooling references.                     |

The package's `prepare` script builds source installations. Published npm packages include the built files.

Tests start in `packages/galley.md/__tests__/private/`. The lean `public/` suite protects selected consumer capabilities: Markdown structure, native tables, source import content and identity, async components and document context, custom import plugins, fresh dependency evaluation, write/check and CLI behavior, frontmatter destinations, and unsaved preview content and offsets. It is a selected contract, not exhaustive API coverage. Detailed editor protocols, generated TypeScript, exact error messages, serializer snapshots, and implementation assertions remain private.

Public tests import `galley.md`; the current Vite and TypeScript configuration map that name to source. The runner supplies `GALLEY_TEST_CLI` for subprocess tests. Update these current mappings when moving entrypoints. Public assertions use an independent Markdown parser, preserving content, code bytes, languages, and structure while allowing equivalent formatting. Exact source preservation and read-only checks deliberately compare bytes. Keep every fixture and expectation helper inside the restore pattern in `breakage.config.ts`; the fixture loader is restored too. Changes to observer dependencies must keep released tests runnable.

`test:public` runs once without task caching or a self-build and fails if no tests are selected. `test` runs public and private suites together. CI runs current tests and historical compatibility in separate jobs. The compatibility command always discovers the latest matching tag on `origin`, pins its commit in ignored `.breakage/baseline.json`, and lets the pinned `breakage@0.8.5` restore released tests and helpers around the run. Run it from a clean checkout with access to origin; do not cache it.

Breakage's certification command compares Galley's intended version with that exact baseline. A major increase certifies a failed released-contract check; before 1.0, a minor increase does too. The command reads Changesets' assembled release plan, or accepts an already-versioned breaking manifest after changesets have been consumed. Patch releases and prerelease-identifier changes alone do not certify failures. Certification acknowledges a failed check under the release policy; it does not establish compatibility or diagnose the failure's cause. Current tests still have to pass independently.

The exact `galley.md@0.1.5` tag at `347090b27913997a9f032cc4aeb6184b1c4cbb98` predates these contracts. Only that missing-suite result emits a **BOOTSTRAP ONLY** notice and job summary; it does not establish historical compatibility. The patch changeset seeds the first contract-bearing release. Remove the exception after publishing it. Any other missing suite, moved tag, dirty checkout, discovery failure, or inconclusive result fails.

Test examples live in `packages/galley.md/__tests__/fixtures/`. Import their source as text using import attributes:

```ts
import example from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
```

The test-only Vite plugin uses esbuild's native import-attribute handling to read these files without compiling or executing them. TypeScript resolves `#fixtures/*` to a string declaration. Tests copy the strings into temporary projects so relative imports, source changes, and file-system checks still run against isolated files. Fixture dependencies use the same text imports.

Fixtures preserve their exact bytes, including leading blank lines, missing final newlines, and intentionally invalid syntax. Formatting, linting, and direct type checking exclude the fixture directory; spelling checks still apply. Keep expected errors and focused output assertions in the test files. Larger expected Markdown documents can live alongside their input fixtures.

To build a VSIX after `pnpm build`, run `node packages/galley.md/dist/cli.mjs vsix build artifacts/editor`. To install it, run `node packages/galley.md/dist/cli.mjs vsix [editor]`.

For the initial `0.0.0` npm publication, run `pnpm build`, then `pnpm --filter galley.md publish`. `release:version` applies pending changesets and advances the version.
