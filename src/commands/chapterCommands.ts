import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ReadStore } from '../epub/readStore';
import type { NovelStore } from '../sources/novelStore';
import type { DownloadQueue } from '../sources/downloadQueue';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import { ChapterItem } from '../tree/chapterItem';
import { BookItem } from '../tree/bookItem';

export interface ChapterDeps {
  library: Library;
  readStore: ReadStore;
  novels: NovelStore;
  downloads: DownloadQueue;
  tree: LibraryTreeProvider;
}

type Selection = ChapterItem | BookItem;

/**
 * Chapter actions for the Library tree, mirroring the LNReader app's selection bar.
 * The tree allows multi-select, so each command receives the clicked item plus the
 * whole selection, and acts on every selected chapter grouped by book.
 */
export function registerChapterCommands(context: vscode.ExtensionContext, deps: ChapterDeps): void {
  const { readStore, novels, downloads, tree, library } = deps;
  const chapters = (item: Selection, selected?: Selection[]) => groupChapters(item, selected);
  const refresh = () => tree.refresh();

  context.subscriptions.push(
    vscode.commands.registerCommand('openReader.markRead', async (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        await readStore.setRead(filePath, indexes, true);
      }
    }),
    vscode.commands.registerCommand('openReader.markUnread', async (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        await readStore.setRead(filePath, indexes, false);
      }
    }),
    vscode.commands.registerCommand('openReader.markPreviousRead', async (item: ChapterItem) => {
      await readStore.markPreviousRead(item.filePath, item.index);
    }),
    vscode.commands.registerCommand('openReader.bookmark', async (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        await readStore.setBookmarked(filePath, indexes, true);
      }
    }),
    vscode.commands.registerCommand('openReader.removeBookmark', async (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        await readStore.setBookmarked(filePath, indexes, false);
      }
    }),
    vscode.commands.registerCommand('openReader.downloadChapters', (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        if (library.isOnline(filePath)) {
          downloads.enqueue(filePath, indexes);
        }
      }
    }),
    vscode.commands.registerCommand('openReader.deleteDownloads', async (item: Selection, selected?: Selection[]) => {
      for (const [filePath, indexes] of chapters(item, selected)) {
        if (library.isOnline(filePath)) {
          await novels.deleteDownloads(filePath, indexes);
        }
      }
      refresh();
    }),

    // Whole-book actions.
    vscode.commands.registerCommand('openReader.markBookRead', async (item: BookItem) => {
      await readStore.setRead(item.book.filePath, range(item.book.meta.totalChapters), true);
    }),
    vscode.commands.registerCommand('openReader.markBookUnread', async (item: BookItem) => {
      await readStore.setRead(item.book.filePath, range(item.book.meta.totalChapters), false);
    }),
    vscode.commands.registerCommand('openReader.downloadBook', (item: BookItem) => pickAndDownload(item, deps)),
    vscode.commands.registerCommand('openReader.deleteBookDownloads', async (item: BookItem) => {
      const ok = await vscode.window.showWarningMessage(
        `Delete every downloaded chapter of “${item.book.meta.title}”?`,
        { modal: true },
        'Delete'
      );
      if (ok) {
        await downloads.cancel(item.book.filePath);
        await novels.deleteDownloads(item.book.filePath);
        refresh();
      }
    }),
    vscode.commands.registerCommand('openReader.cancelDownloads', (filePath?: string) => {
      if (filePath) {
        void downloads.cancel(filePath);
      } else {
        downloads.cancelAll();
      }
    })
  );
}

/** The app's download menu: next N, all unread, or everything. */
async function pickAndDownload(item: BookItem, { readStore, novels, downloads }: ChapterDeps): Promise<void> {
  const { filePath, meta } = item.book;
  const { read } = readStore.get(filePath);
  const have = await novels.downloadedIndexes(filePath);
  const all = range(meta.totalChapters);
  const unread = all.filter((i) => !read.has(i));
  const from = Math.max(0, unread[0] ?? 0);
  const next = (n: number) => all.slice(from, from + n);
  const missing = (list: number[]) => list.filter((i) => !have.has(i));

  const choices = [
    { label: 'Next chapter', indexes: next(1) },
    { label: 'Next 5 chapters', indexes: next(5) },
    { label: 'Next 10 chapters', indexes: next(10) },
    { label: 'Unread chapters', indexes: unread },
    { label: 'All chapters', indexes: all },
  ].map((choice) => ({ ...choice, todo: missing(choice.indexes) }));

  const picked = await vscode.window.showQuickPick(
    choices.map((choice) => ({
      label: choice.label,
      description: choice.todo.length ? `${choice.todo.length} to download` : 'all downloaded',
      choice,
    })),
    { title: `Download “${meta.title}”` }
  );
  if (picked && picked.choice.todo.length > 0) {
    downloads.enqueue(filePath, picked.choice.todo);
  }
}

function groupChapters(item: Selection, selected?: Selection[]): Map<string, number[]> {
  const items = selected && selected.length > 0 ? selected : [item];
  const out = new Map<string, number[]>();
  for (const entry of items) {
    if (entry instanceof ChapterItem) {
      out.set(entry.filePath, [...(out.get(entry.filePath) ?? []), entry.index]);
    } else if (entry instanceof BookItem) {
      out.set(entry.book.filePath, range(entry.book.meta.totalChapters));
    }
  }
  return out;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
