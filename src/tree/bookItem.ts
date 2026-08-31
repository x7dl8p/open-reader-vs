import * as vscode from 'vscode';
import type { LibraryBook } from '../epub/library';

export class BookItem extends vscode.TreeItem {
  constructor(
    public readonly book: LibraryBook,
    progressIndex: number,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(book.meta.title, collapsibleState);
    // A stable id keeps expansion and selection across refreshes, and lets reveal
    // find the node again after the tree has been rebuilt.
    this.id = book.filePath;
    this.contextValue = 'book';
    this.iconPath = new vscode.ThemeIcon(book.filePath.toLowerCase().endsWith('.cbz') ? 'file-media' : 'book');
    this.resourceUri = vscode.Uri.file(book.filePath);
    this.tooltip = `${book.meta.title}${book.meta.creator ? ` — ${book.meta.creator}` : ''}\n${book.filePath}`;
    this.description = describeBook(book, progressIndex);
    this.command = {
      command: 'openReader.openToc',
      title: 'Open Table of Contents',
      arguments: [book.filePath],
    };
  }
}

function describeBook(book: LibraryBook, progressIndex: number): string {
  const { creator, totalChapters } = book.meta;
  if (totalChapters === 0) {
    return creator ?? '';
  }
  const author = creator ? `${creator} · ` : '';
  return `${author}${progressIndex + 1}/${totalChapters}`;
}
