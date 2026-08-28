import * as path from 'path';
import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import { formatForPath } from '../epub/formats';
import { BookItem } from './bookItem';
import { ChapterItem } from './chapterItem';
import { BookFileItem, FileItem, FolderItem } from './fileItem';

export type LibraryTreeElement = BookItem | ChapterItem | FolderItem | BookFileItem | FileItem;

/**
 * 'library' lists parsed books with their chapters; 'files' browses the library
 * folders as they sit on disk. The eye button in the view title switches between them.
 */
export type LibraryViewMode = 'library' | 'files';

const CONTEXT_KEY = 'openReader.fileView';
const SKIPPED_DIRS = new Set(['node_modules']);

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LibraryTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private mode: LibraryViewMode = 'library';

  constructor(private library: Library, private progress: ProgressStore) {
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setViewMode(mode: LibraryViewMode): void {
    this.mode = mode;
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, mode === 'files');
    this.refresh();
  }

  getTreeItem(element: LibraryTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LibraryTreeElement): Promise<LibraryTreeElement[]> {
    if (element instanceof FolderItem) {
      return this.readFolder(element.dirPath);
    }
    if (element instanceof BookItem) {
      return this.getChapters(element);
    }
    if (element) {
      return [];
    }
    return this.mode === 'files' ? this.getFileRoots() : this.getBooks();
  }

  private async getBooks(): Promise<BookItem[]> {
    const books = await this.library.listBooks();
    return books.map(
      (book) => new BookItem(book, this.progress.get(book.filePath), vscode.TreeItemCollapsibleState.Collapsed)
    );
  }

  private getChapters(bookItem: BookItem): ChapterItem[] {
    const { book } = bookItem;
    const currentIndex = this.progress.get(book.filePath);
    return book.meta.toc.map((chapter, index) => new ChapterItem(book.filePath, index, chapter.label, index === currentIndex));
  }

  private async getFileRoots(): Promise<LibraryTreeElement[]> {
    const folders = this.library.getLibraryFolders();
    if (folders.length === 0) {
      return [];
    }
    if (folders.length === 1) {
      return this.readFolder(folders[0]);
    }
    return folders.map((folder) => new FolderItem(folder, undefined, true));
  }

  private async readFolder(dirPath: string): Promise<LibraryTreeElement[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
    } catch {
      return [];
    }

    const folders: FolderItem[] = [];
    const files: Array<BookFileItem | FileItem> = [];
    for (const [name, type] of entries) {
      if (name.startsWith('.') || SKIPPED_DIRS.has(name)) {continue;}
      const full = path.join(dirPath, name);
      if (type & vscode.FileType.Directory) {
        folders.push(new FolderItem(full));
      } else {
        files.push(formatForPath(name) ? new BookFileItem(full) : new FileItem(full));
      }
    }

    const byLabel = (a: vscode.TreeItem, b: vscode.TreeItem) => String(a.label).localeCompare(String(b.label));
    folders.sort(byLabel);
    files.sort(byLabel);
    return [...folders, ...files];
  }
}
