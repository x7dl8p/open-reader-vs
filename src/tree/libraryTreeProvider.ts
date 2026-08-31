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

/** Folders first, then files, each alphabetical — the order the Explorer uses. */
function sortEntries(entries: LibraryTreeElement[]): LibraryTreeElement[] {
  const byLabel = (a: vscode.TreeItem, b: vscode.TreeItem) => String(a.label).localeCompare(String(b.label));
  const folders = entries.filter((entry) => entry instanceof FolderItem).sort(byLabel);
  const files = entries.filter((entry) => !(entry instanceof FolderItem)).sort(byLabel);
  return [...folders, ...files];
}

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LibraryTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private mode: LibraryViewMode = 'library';
  /** Items handed out most recently, so getParent and reveal can find them again. */
  private bookItems = new Map<string, BookItem>();
  private chapterItems = new Map<string, ChapterItem>();
  private view?: vscode.TreeView<LibraryTreeElement>;
  private pendingReveal?: { filePath: string; index: number };
  private revealing = false;

  constructor(private library: Library, private progress: ProgressStore) {
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
  }

  /** Required for TreeView.reveal to walk up from a chapter to its book. */
  getParent(element: LibraryTreeElement): LibraryTreeElement | undefined {
    return element instanceof ChapterItem ? this.bookItems.get(element.filePath) : undefined;
  }

  /** The tree cannot reveal anything until the view it belongs to is known. */
  attachView(view: vscode.TreeView<LibraryTreeElement>): void {
    this.view = view;
  }

  /**
   * Move the reading marker to a chapter and select it.
   *
   * The chapter's tree item may not exist yet — on a restored session the reader renders
   * before the tree has been asked for anything. So the target is remembered and applied
   * again as soon as the items it needs are produced.
   */
  markReading(filePath: string, index: number): void {
    this.pendingReveal = { filePath, index };
    this.refresh();
    void this.applyPendingReveal();
  }

  private async applyPendingReveal(): Promise<void> {
    const target = this.pendingReveal;
    if (!target || this.revealing || !this.view?.visible) {
      return;
    }

    const book = this.bookItems.get(target.filePath);
    if (!book) {
      return; // getBooks will call back once the library has loaded.
    }

    this.revealing = true;
    try {
      // Expanding the book is what causes its chapters to be created.
      await this.view.reveal(book, { expand: true, select: false, focus: false });

      const chapter = this.chapterItems.get(`${target.filePath}::${target.index}`);
      if (chapter) {
        this.pendingReveal = undefined;
        await this.view.reveal(chapter, { select: true, focus: false });
      }
    } catch {
      // The book is not in the tree right now — the refresh above has already moved the
      // marker, so the selection is the only thing lost.
    } finally {
      this.revealing = false;
    }
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
    const items = books.map(
      (book) => new BookItem(book, this.progress.get(book.filePath), vscode.TreeItemCollapsibleState.Collapsed)
    );

    this.bookItems = new Map(items.map((item) => [item.book.filePath, item]));
    void this.applyPendingReveal();
    return items;
  }

  private getChapters(bookItem: BookItem): ChapterItem[] {
    const { book } = bookItem;
    const currentIndex = this.progress.get(book.filePath);
    const items = book.meta.toc.map(
      (chapter, index) => new ChapterItem(book.filePath, index, chapter.label, index === currentIndex)
    );

    for (const item of items) {
      this.chapterItems.set(`${book.filePath}::${item.index}`, item);
    }
    void this.applyPendingReveal();
    return items;
  }

  /** Every browse root's contents, merged flat — no per-root header nodes. */
  private async getFileRoots(): Promise<LibraryTreeElement[]> {
    const folders = this.library.getBrowseFolders();
    const listings = await Promise.all(folders.map((folder) => this.readFolder(folder)));
    return sortEntries(listings.flat());
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

    return sortEntries([...folders, ...files]);
  }
}
