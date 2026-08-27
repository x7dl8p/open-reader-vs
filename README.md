# Open-Reader

A native e-book reader for VS Code. Supports EPUB and CBZ today; the format layer (`src/epub/formats.ts`) is a small registry so more formats can be added without touching the rest of the extension.

## Features

- **Library view** in the activity bar — lists every `.epub`/`.cbz` found in your library folders; expand a book to see its chapters (or comic pages).
- Click a book to open its **table of contents** as a document in the editor.
- Each chapter has two destinations, picked per-click:
  - **Now Reading** panel, stacked below Library in the sidebar — styled prose (bold/italic/images), independent of your code editor font, with its own Prev/Next controls.
  - A real **editor tab**, using its own font/size/line-height settings that never touch your code editor's settings.
- **Reader Settings** page (gear icon) — font family/size/weight, line height, letter spacing, alignment, margins, paragraph indent, two-page layout, and reading theme (presets or custom colors), all applied live to the Now Reading panel.
- **Reading progress** is remembered per book and shown in the Library view.
- Embedded chapter images are extracted to disk and referenced by file path, instead of being inlined as data URIs.

## Requirements

None — everything runs locally, no external services.

## Extension Settings

This extension contributes the following settings (all under `openReader.*`):

- `libraryFolders`: Folders to scan for `.epub` files. When empty, the current workspace folder(s) are scanned.
- `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `indent`, `showChapterNumbers`, `twoPageMode`, `marginX`, `marginY`, `bgColor`, `textColor`: reading typography/theme, editable from the Reader Settings page or directly here.

## Known Issues

- Table/complex layout formatting inside EPUBs is flattened to plain HTML/Markdown.

## Release Notes

### 0.0.1

Initial release.
