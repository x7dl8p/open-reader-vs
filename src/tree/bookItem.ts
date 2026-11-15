import * as vscode from 'vscode';
import type { LibraryBook } from '../epub/library';

export class BookItem extends vscode.TreeItem {
  constructor(
    public readonly book: LibraryBook,
    progressIndex: number,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readCount = 0
  ) {
    super(book.meta.title, collapsibleState);
    // A stable id keeps expansion and selection across refreshes, and lets reveal
    // find the node again after the tree has been rebuilt.
    this.id = book.filePath;
    this.contextValue = book.online ? 'onlineBook' : 'book';
    this.iconPath = new vscode.ThemeIcon(
      book.online ? 'globe' : book.filePath.toLowerCase().endsWith('.cbz') ? 'file-media' : 'book'
    );
    if (!book.online) {
      this.resourceUri = vscode.Uri.file(book.filePath);
    }
    const where = book.online ? `${book.online.sourceName} · ${book.online.url}` : book.filePath;
    this.tooltip = `${book.meta.title}${book.meta.creator ? ` by ${book.meta.creator}` : ''}\n${where}`;
    this.description = describeBook(book, progressIndex, readCount);
    this.command = {
      command: 'openReader.openToc',
      title: 'Open Table of Contents',
      arguments: [book.filePath],
    };
  }
}

function describeBook(book: LibraryBook, progressIndex: number, readCount: number): string {
  const { creator, totalChapters } = book.meta;
  if (totalChapters === 0) {
    return creator ?? '';
  }
  const author = creator ? `${creator} · ` : '';
  // Online novels grow; show what is left to read, as the app's unread badge does.
  const unread = totalChapters - readCount;
  const tail = book.online && readCount > 0 ? ` · ${unread} unread` : '';
  return `${author}${progressIndex + 1}/${totalChapters}${tail}`;
}
