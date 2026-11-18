import * as path from 'path';
import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ReadStore } from '../epub/readStore';
import type { TitleStore } from '../epub/titleStore';
import type { ProgressStore } from '../epub/progress';
import type { NovelStore } from '../sources/novelStore';
import type { DownloadQueue } from '../sources/downloadQueue';
import type { BrowsePanel } from '../sources/browsePanel';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { BookmarksPanel } from '../content/bookmarksView';
import type { BookItem } from '../tree/bookItem';

export interface BookDeps {
  library: Library;
  readStore: ReadStore;
  progress: ProgressStore;
  titles: TitleStore;
  novels: NovelStore;
  downloads: DownloadQueue;
  browse: BrowsePanel;
  tree: LibraryTreeProvider;
  bookmarks: BookmarksPanel;
}

/** The Library's right-click actions on a book, and the Bookmarks list. */
export function registerBookCommands(context: vscode.ExtensionContext, deps: BookDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openReader.renameBook', (item: BookItem) => renameBook(item, deps)),
    vscode.commands.registerCommand('openReader.deleteBook', (item: BookItem) => deleteBook(item, deps)),
    vscode.commands.registerCommand('openReader.revealBook', (item: BookItem) =>
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.book.filePath))
    ),
    vscode.commands.registerCommand('openReader.copyBookPath', (item: BookItem) =>
      vscode.env.clipboard.writeText(item.book.filePath)
    ),
    vscode.commands.registerCommand('openReader.showBookmarks', () => deps.bookmarks.open())
  );
}

/** The tree and the Bookmarks page follow TitleStore.onDidChange, so nothing else to refresh. */
async function renameBook(item: BookItem, { titles }: BookDeps): Promise<void> {
  const current = item.book.meta.title;
  const name = await vscode.window.showInputBox({
    title: 'Rename Book',
    prompt: 'The name shown in your library. Leave it empty to use the book’s own title again.',
    value: current,
    valueSelection: [0, current.length],
  });
  if (name === undefined) {
    return;
  }
  await titles.set(item.book.filePath, name);
}

/**
 * A local book's file goes to the trash. An online novel is removed with its downloaded
 * chapters; it can be added again from Browse Sources.
 */
async function deleteBook(item: BookItem, deps: BookDeps): Promise<void> {
  const { book } = item;
  const online = Boolean(book.online);
  const detail = online
    ? 'The novel and its downloaded chapters are removed. You can add it again from Browse Sources.'
    : `${path.basename(book.filePath)} is moved to the trash.`;
  const ok = await vscode.window.showWarningMessage(`Delete “${book.meta.title}”?`, { modal: true, detail }, 'Delete');
  if (ok !== 'Delete') {
    return;
  }
  try {
    if (online) {
      // Let chapters already downloading finish first, or they recreate the folder.
      await deps.downloads.cancel(book.filePath);
      await deps.novels.remove(book.filePath);
    } else {
      await vscode.workspace.fs.delete(vscode.Uri.file(book.filePath), { useTrash: true });
      deps.library.invalidate(book.filePath);
    }
    await deps.readStore.forget(book.filePath);
    await deps.progress.forget(book.filePath);
    await deps.titles.set(book.filePath, undefined);
    deps.tree.refresh();
    deps.browse.notifyChanged();
  } catch (err) {
    void vscode.window.showErrorMessage(`Could not delete: ${err instanceof Error ? err.message : String(err)}`);
  }
}
