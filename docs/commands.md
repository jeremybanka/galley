# Repository commands

Run commands from the repository root. The publishable package lives in `packages/galley`; the root package is private. `mise.toml` selects the Node and pnpm versions.

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

To build a VSIX after `pnpm build`, run `node packages/galley/dist/cli.mjs vsix build artifacts/editor`. To install it, run `node packages/galley/dist/cli.mjs vsix [editor]`.

For the initial `0.0.0` npm publication, run `pnpm build`, then `pnpm --filter galley.md publish`. `release:version` applies pending changesets and advances the version.
