# galley.md workspace

- Keep consumer guidance in `packages/galley/AGENTS.md` and the canonical user guide in `packages/galley/README.md`. Keep contributor, maintenance, release, and documentation-placement instructions here.
- Prefer `.ts` source files and Node scripts; do not add `.js`, `.cjs`, `.mjs`, or `.mts` source files.
- Keep the user guide synchronized with the public API. Keep contributor commands in `docs/commands.md`.
- Use `fmt` to write formatting, `check` to aggregate `check:*` validators, and `test` to run tests once.
- Keep changeset bodies on a single line. Before 1.0.0, use patch releases for features and fixes, and minor releases for breaking changes.
- Use the target release's official `vp migrate --no-interactive` for Vite Plus upgrades. Preserve the lockfile until migration runs, let the migrator align the toolchain, and review its manual findings before running formatting and checks.
