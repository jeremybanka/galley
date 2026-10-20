# Repository commands

Run commands from the repository root. `mise.toml` selects the Node and pnpm versions.

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

`prepare` builds source installations, including pinned Git dependencies. Published npm packages include the built files.

To build a VSIX after `pnpm build`, run `node dist/cli.mjs vsix build artifacts/editor`. To install it, run `node dist/cli.mjs vsix [editor]`.
