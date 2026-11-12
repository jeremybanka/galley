# dprint-plugin-mdx

## 0.1.3

### Patch Changes

- 214833f: Upgrade the MDX formatter to dprint-core 0.77.0 and adapt its Wasm plugin metadata to the updated API.

## 0.1.2

### Patch Changes

- 31de768: Update the bundled TypeScript formatter to 0.97.1 and adapt to its shared text and formatting arena API.

## 0.1.1

### Patch Changes

- 293fcc7: Upgrade dprint-core to 0.75.0 and migrate print generation and tracing to its arena-based API.

## 0.1.0

### Minor Changes

- 1d2107c: Release the independent MDX formatter as 0.1.0 with bundled TypeScript formatting, consistent expression and JSX layouts, whitespace normalization, preserved import/export order, and conventional MDX compatibility verified against the standard MDX compiler.

## 0.0.0

Initial release of the independent dprint MDX plugin, based on the official Markdown formatter.

- Format Markdown while preserving MDX syntax and literal values.
- Format embedded TypeScript/TSX with a bundled official dprint TypeScript formatter, including type imports, import attributes, `as`, and `satisfies`.
- Preserve import and export order, and support multiline MDX comments containing braces.
- Use consistent layouts for equivalent expressions and self-closing JSX tags, with formatting stabilized before returning the result.
- Collapse redundant blank lines, prose and JSX spacing, and expression padding; remove trailing whitespace while preserving hard breaks, indentation, literals, and ignored regions.
- Include the WebAssembly plugin, configuration schema, checksum manifest, Rust source, locked build recipe, and license notices.
