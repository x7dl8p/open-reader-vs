import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import { BookItem } from './bookItem';
import { ChapterItem } from './chapterItem';

export type LibraryTreeElement = BookItem | ChapterItem;

const CONTEXT_KEY = 'openReader.chaptersHidden';

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LibraryTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private chaptersHidden = false;

  constructor(private library: Library, private progress: ProgressStore) {
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setChaptersHidden(hidden: boolean): void {
    this.chaptersHidden = hidden;
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, hidden);
    this.refresh();
  }

  getTreeItem(element: LibraryTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LibraryTreeElement): Promise<LibraryTreeElement[]> {
    if (!element) {
      return this.getBooks();
    }
    if (element instanceof BookItem && !this.chaptersHidden) {
      return this.getChapters(element);
    }
    return [];
  }

  private async getBooks(): Promise<BookItem[]> {
    const books = await this.library.listBooks();
    const state = this.chaptersHidden
      ? vscode.TreeItemCollapsibleState.None
      : vscode.TreeItemCollapsibleState.Collapsed;
    return books.map((book) => new BookItem(book, this.progress.get(book.filePath), state));
  }

  private getChapters(bookItem: BookItem): ChapterItem[] {
    const { book } = bookItem;
    const currentIndex = this.progress.get(book.filePath);
    return book.meta.toc.map((chapter, index) => new ChapterItem(book.filePath, index, chapter.label, index === currentIndex));
  }
}
