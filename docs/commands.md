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

Public tests import `galley.md`; the current Vite and TypeScript configuration map that name to source. The runner supplies `GALLEY_TEST_CLI` for subprocess tests. Update these current mappings when moving entrypoints. Public assertions use an independent Markdown parser, preserving content, code bytes, languages, and structure while allowing equivalent formatting. Exact source preservation and read-only checks deliberately compare bytes. Keep every fixture and expectation helper inside the restore pattern in `packages/galley.md/breakage.config.ts`; the fixture loader is restored too. Breakage resolves commands and restore paths from the package-local configuration directory. Changes to observer dependencies must keep released tests runnable.

`test:public` runs once without task caching or a self-build and fails if no tests are selected. `test` runs public and private suites together. CI runs current tests and historical compatibility in separate jobs. The workspace's uncached `test:breakage` delegates to the package script, which first runs `breakage prelude --out .breakage/baseline.json`, then `breakage breakage.config.ts --verbose --baseline-file .breakage/baseline.json`. These direct CLI calls discover the latest matching tag on `origin`, pin its commit in ignored `packages/galley.md/.breakage/baseline.json`, and let the pinned `breakage@0.10.0` restore released tests and helpers around the run. Run from a clean checkout with access to origin; do not cache the command.

The package's Breakage configuration uses `changesetsReleaseDelta()` and `semverPolicy({ beforeV1: "minor" })` to compare Galley's intended version with that exact baseline. A major increase certifies a failed released-contract check; before 1.0, a minor increase does too. The upstream helper reads Changesets' assembled release plan, falling back to the current manifest after changesets have been consumed. The pinned `@breakage/changesets` integration owns its Changesets dependencies. Patch releases and prerelease-identifier changes alone do not certify failures. Certification acknowledges a failed check under the release policy; it does not establish compatibility or diagnose the failure's cause. The test command's exit 1 reports incompatibility that release policy may permit; other nonzero exits and process failures are setup errors and cannot be certified. These exit codes are a reporting convention, not an automatic diagnosis. Current tests still have to pass independently.

The latest `galley.md@0.1.5` release predates these contracts. Until the first contract-bearing release is published, Breakage reports the missing suite as inconclusive and exits 2; the compatibility CI job therefore fails. This is expected and does not establish historical compatibility. There is no bootstrap success override. The patch changeset seeds the first contract-bearing release.

Test examples live in `packages/galley.md/__tests__/fixtures/`. Import their source as text using import attributes:

```ts
import example from "#fixtures/compiler/html-branding.mdx" with { type: "text" }
```

The test-only Vite plugin uses esbuild's native import-attribute handling to read these files without compiling or executing them. TypeScript resolves `#fixtures/*` to a string declaration. Tests copy the strings into temporary projects so relative imports, source changes, and file-system checks still run against isolated files. Fixture dependencies use the same text imports.

Fixtures preserve their exact bytes, including leading blank lines, missing final newlines, and intentionally invalid syntax. Formatting, linting, and direct type checking exclude the fixture directory; spelling checks still apply. Keep expected errors and focused output assertions in the test files. Larger expected Markdown documents can live alongside their input fixtures.

Keep the user guide's `dprint-ignore` comments before MDX examples. The Markdown plugin treats embedded MDX as Markdown and can rewrite JSX expressions as literal HTML attribute strings. The rest of the guide remains formatted normally.

To build a VSIX after `pnpm build`, run `node packages/galley.md/dist/cli.mjs vsix build artifacts/editor`. To install it, run `node packages/galley.md/dist/cli.mjs vsix [editor]`.

The workspace associates `.mdx` files with the **galley.md** language. Install the Galley extension using the command above so fixtures use Galley's JSX runtime and import handling in the editor. Fixtures remain excluded from direct project type checking.

For the initial `0.0.0` npm publication, run `pnpm build`, then `pnpm --filter galley.md publish`. `release:version` applies pending changesets and advances the version.
