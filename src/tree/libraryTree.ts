import * as vscode from 'vscode';
import type { Library, LibraryBook } from '../epub/library';
import type { ProgressStore } from '../epub/progress';

export class BookItem extends vscode.TreeItem {
  constructor(public readonly book: LibraryBook, progressIndex: number) {
    const total = book.meta.totalChapters;
    super(book.meta.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = book.meta.creator ?? '';
    this.tooltip = `${book.meta.title}${book.meta.creator ? ` — ${book.meta.creator}` : ''}\n${book.filePath}`;
    this.contextValue = 'book';
    this.iconPath = new vscode.ThemeIcon('book');
    this.resourceUri = vscode.Uri.file(book.filePath);
    if (total > 0) {
      this.description = `${book.meta.creator ? book.meta.creator + ' · ' : ''}${progressIndex + 1}/${total}`;
    }
    this.command = {
      command: 'bookReader.openToc',
      title: 'Open Table of Contents',
      arguments: [book.filePath],
    };
  }
}

export class ChapterItem extends vscode.TreeItem {
  constructor(filePath: string, index: number, label: string, isCurrent: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'chapter';
    this.iconPath = new vscode.ThemeIcon(isCurrent ? 'debug-stackframe-dot' : 'circle-small');
    this.description = isCurrent ? 'reading' : undefined;
    this.command = {
      command: 'bookReader.openChapter',
      title: 'Open Chapter',
      arguments: [filePath, index],
    };
  }
}

export type LibraryTreeElement = BookItem | ChapterItem;

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LibraryTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private library: Library, private progress: ProgressStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LibraryTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LibraryTreeElement): Promise<LibraryTreeElement[]> {
    if (!element) {
      const books = await this.library.listBooks();
      if (books.length === 0) {return [];}
      return books.map((book) => new BookItem(book, this.progress.get(book.filePath)));
    }

    if (element instanceof BookItem) {
      const currentIndex = this.progress.get(element.book.filePath);
      const chapters = element.book.meta.toc;
      return chapters.map(
        (chapter, index) => new ChapterItem(element.book.filePath, index, chapter.label, index === currentIndex)
      );
    }

    return [];
  }
}
