import * as vscode from 'vscode';

export const TOC_SCHEME = 'open-reader-toc';
export const PROSE_LANGUAGE = 'openReaderProse';

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'untitled';
}

export function tocUri(filePath: string, bookTitle: string): vscode.Uri {
  const query = encodeURIComponent(JSON.stringify({ filePath }));
  return vscode.Uri.from({
    scheme: TOC_SCHEME,
    path: `/${slug(bookTitle)}-contents.md`,
    query,
  });
}

export function parseTocQuery(uri: vscode.Uri): { filePath: string } {
  return JSON.parse(decodeURIComponent(uri.query));
}
