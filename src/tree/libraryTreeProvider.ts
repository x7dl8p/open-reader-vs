import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import { BookItem } from './bookItem';
import { ChapterItem } from './chapterItem';

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
    if (!element) {return this.getBooks();}
    if (element instanceof BookItem) {return this.getChapters(element);}
    return [];
  }

  private async getBooks(): Promise<BookItem[]> {
    const books = await this.library.listBooks();
    return books.map((book) => new BookItem(book, this.progress.get(book.filePath)));
  }

  private getChapters(bookItem: BookItem): ChapterItem[] {
    const { book } = bookItem;
    const currentIndex = this.progress.get(book.filePath);
    return book.meta.toc.map((chapter, index) => new ChapterItem(book.filePath, index, chapter.label, index === currentIndex));
  }
}
