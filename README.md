# Reader

A native EPUB reader for VS Code. No webview — chapters open as real Markdown documents in the editor, using VS Code's own theming, fonts, and built-in Markdown preview.

## Features

- **Library view** in the activity bar — lists every `.epub` found in your library folders; expand a book to see its chapters.
- Click a book to open its **table of contents** as a document in the editor.
- Click a chapter to open it as a **Markdown document**, with an optional live preview via VS Code's built-in Markdown preview.
- Editor-title buttons for **previous / next chapter** and **back to table of contents** while a chapter is open.
- **Reading progress** is remembered per book and shown in the Library view.
- Embedded chapter images are extracted to disk and referenced by file path, instead of being inlined as data URIs.

## Requirements

None — everything runs locally, no external services.

## Extension Settings

This extension contributes the following settings:

- `bookReader.libraryFolders`: Folders to scan for `.epub` files. When empty, the current workspace folder(s) are scanned.
- `bookReader.autoOpenPreview`: Automatically open VS Code's built-in Markdown preview alongside a chapter's source (default: `true`).

## Known Issues

- Table/complex layout formatting inside EPUBs is flattened to plain Markdown.

## Release Notes

### 0.0.1

Initial release.
