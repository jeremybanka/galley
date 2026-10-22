# galley workspace

- Keep consumer guidance in `packages/galley.md/AGENTS.md` and the canonical user guide in `packages/galley.md/README.md`. Keep contributor, maintenance, release, and documentation-placement instructions here.
- Prefer `.ts` source files and Node scripts; do not add `.js`, `.cjs`, `.mjs`, or `.mts` source files.
- Keep the user guide synchronized with the public API. Keep contributor commands in `docs/commands.md`.
- Keep test examples in `packages/galley.md/__tests__/fixtures/` and import them with `with { type: "text" }` through the `#fixtures/` alias. Fixtures are intentionally excluded from formatting, linting, and direct type checking so invalid syntax and exact whitespace remain testable; keep assertions in the test files.
- Use `fmt` to write formatting, `check` to aggregate `check:*` validators, and `test` to run tests once.
- Keep changeset bodies on a single line. Before 1.0.0, use patch releases for features and fixes, and minor releases for breaking changes.
- Use the target release's official `vp migrate --no-interactive` for Vite Plus upgrades. Preserve the lockfile until migration runs, let the migrator align the toolchain, and review its manual findings before running formatting and checks.
