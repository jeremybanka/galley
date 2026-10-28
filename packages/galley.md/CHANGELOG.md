# galley.md

## 0.3.1

### Patch Changes

- b7bf911: Show contextual diffs with existing/generated line numbers, visible whitespace, and colored character highlights in terminals and GitHub Actions when galley check finds stale or missing output.

## 0.3.0

### Minor Changes

- f560a03: Render native JSX as HTML and SVG, with typed static attributes, and introduce Markdown.Table for explicit GFM pipe tables; migrate Markdown-producing table tags to Markdown.Table, use native tags instead of the deprecated Html.Element, and use Markdown syntax or nodes when Markdown output is required.

## 0.2.0

### Minor Changes

- 1d2107c: Support TypeScript in MDX code regions with a shared compiler/editor parser, TSX content mapping, and TypeScript highlighting; require explicit component props and use Html.Element for HTML attributes and custom tags.

### Patch Changes

- 1d2107c: Keep healthy MDX editor regions available around syntax and preview errors, report preview failures in Problems, and retain clearly marked previous output while editing.
- 1d2107c: Collapse padding around multiline TypeScript expressions and JSX props, and keep peek actions and preview documents stable through source edits and failed evaluations.

## 0.1.7

### Patch Changes

- b54468e: Give each CLI command an accurate description, add `galley help`, and register `-h`/`--help` only on the root command instead of every subcommand.
- 6d72b87: Fix missing React runtime errors and duplicate diagnostics and hover text when editing Galley MDX files.
- a8eb79b: Format compiled Markdown and previews with aligned tables and consistent layout using pinned dprint dependencies while preserving code blocks, raw HTML, and YAML frontmatter; regenerate checked-in output after upgrading.

## 0.1.6

### Patch Changes

- bd81d3c: Establish a consumer behavior test baseline for release compatibility checks with Breakage.

## 0.1.5

### Patch Changes

- e4c3b22: Improve VS Code language server startup, shutdown, document synchronization, and file watcher cleanup by updating the language client and server to v11.

## 0.1.4

### Patch Changes

- 022aa08: Add a Comment component for emitting HTML comments from standard MDX, including inside Html boundaries.

## 0.1.3

### Patch Changes

- eb860ff: Support YAML frontmatter output destinations relative to the source or Git repository root, preserve document metadata, and retain editor source mappings.

## 0.1.2

### Patch Changes

- 9c06ad9: Add an Html component that renders JSX markup, attributes, nested components, and Markdown nodes as static HTML while preserving Markdown rendering outside the boundary, with matching editor previews and JSX support.

## 0.1.1

### Patch Changes

- b35914c: Support native table tags with header column alignment, composable rows and cells, and clear errors for unsupported HTML features and invalid Markdown table structures.

## 0.1.0

### Minor Changes

- 912f57c: Ship the Markdown compiler, attributed source imports, TypeScript 7.1 content mapper, npm language server, and CLI-installable VS Code extension from the standalone galley repository.
