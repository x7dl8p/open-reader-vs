import * as path from 'path';
import * as vscode from 'vscode';
import { Library } from './epub/library';
import { ProgressStore } from './epub/progress';
import { ScrollStore } from './epub/scrollStore';
import { isReaderPrefsChange, loadReaderPrefs, migrateSidePrefs } from './epub/readerPrefs';
import { LibraryTreeProvider } from './tree/libraryTreeProvider';
import { TocContentProvider } from './content/tocProvider';
import { NowReadingViewProvider } from './content/nowReadingView';
import { ReaderPanel } from './content/readerPanel';
import { SettingsPanel } from './content/settingsView';
import { AboutPanel } from './content/aboutView';
import { TOC_SCHEME } from './content/uris';
import { registerCommands } from './commands';
import { allExtensions } from './epub/formats';
import { SourceManager } from './sources/sourceManager';
import { NovelStore } from './sources/novelStore';
import { BrowsePanel } from './sources/browsePanel';
import { registerSourceCommands, runImport } from './commands/sourceCommands';
import { registerChapterCommands } from './commands/chapterCommands';
import { ReadStore } from './epub/readStore';
import { TitleStore } from './epub/titleStore';
import { registerBookCommands } from './commands/bookCommands';
import { BookmarksPanel } from './content/bookmarksView';
import { DownloadQueue } from './sources/downloadQueue';
import { ChapterDecorations } from './tree/chapterItem';

let flushPendingState: (() => Promise<void>) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const storageDir = context.globalStorageUri.fsPath;
  const imagesDir = path.join(storageDir, 'images');
  const sources = new SourceManager(context, storageDir);
  const readStore = new ReadStore(context);
  const novels = new NovelStore(storageDir, sources, readStore);
  const downloads = new DownloadQueue(novels);
  const titles = new TitleStore(context);
  const library = new Library(imagesDir, path.join(storageDir, 'downloads'), novels, titles);
  const progress = new ProgressStore(context);
  const scroll = new ScrollStore(context);
  flushPendingState = async () => {
    sources.flush();
    await scroll.flush();
  };
  void migrateSidePrefs();
  const tree = new LibraryTreeProvider(library, progress, readStore, (filePath) => novels.downloadedIndexes(filePath));
  const treeView = vscode.window.createTreeView('openReaderLibrary', {
    treeDataProvider: tree,
    showCollapseAll: true,
    canSelectMany: true,
  });
  tree.attachView(treeView);

  // Opening a chapter is what marks it read, in either reader.
  const markAsReading = (filePath: string, index: number) => {
    tree.markReading(filePath, index);
    if (!readStore.isRead(filePath, index)) {
      void readStore.setRead(filePath, [index], true);
    }
  };
  const nowReading = new NowReadingViewProvider(library, progress, scroll, vscode.Uri.file(imagesDir), markAsReading);
  const reader = new ReaderPanel(
    library,
    progress,
    scroll,
    vscode.Uri.file(imagesDir),
    vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png'),
    markAsReading
  );
  const settings = new SettingsPanel({ main: reader, side: nowReading });
  const { displayName, version } = context.extension.packageJSON as { displayName?: string; version?: string };
  const about = new AboutPanel(context.extensionUri, displayName ?? 'Open Reader', version ?? '');

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider(NowReadingViewProvider.viewType, nowReading, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  const browse: BrowsePanel = new BrowsePanel(context.extensionUri, { sources, novels, progress, readStore, downloads }, {
    read: (filePath, index) => reader.show(filePath, index),
    libraryChanged: () => tree.refresh(),
    importLink: (url) => runImport(url, { sources, novels, library, tree, browse, progress }),
  });

  registerCommands(context, library, progress, readStore, tree, nowReading, reader, settings, about);
  registerSourceCommands(context, { sources, novels, library, tree, browse, progress });
  registerChapterCommands(context, { library, readStore, novels, downloads, tree });
  const bookmarks = new BookmarksPanel(context.extensionUri, library, readStore, titles);
  context.subscriptions.push(bookmarks, titles.onDidChange(() => tree.refresh()));
  registerBookCommands(context, { library, readStore, progress, titles, novels, downloads, browse, tree, bookmarks });

  // Read marks and downloads show in the tree (dimmed / ↓) and on the Browse page.
  const refreshTree = debounceTimer(() => tree.refresh(), 300);
  const downloadStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  downloadStatus.command = 'openReader.cancelDownloads';
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new ChapterDecorations()),
    downloadStatus,
    readStore.onDidChange((filePath) => {
      refreshTree();
      browse.notifyState(filePath);
    }),
    downloads.onDidChange((status) => {
      browse.notifyDownload(status);
      if (status.done % 5 === 0 || !status.running) {
        refreshTree();
      }
      const running = downloads.running();
      if (running.length === 0) {
        downloadStatus.hide();
        if (status.failed > 0) {
          void vscode.window.showWarningMessage(
            `${status.failed} of ${status.total} chapters failed to download. ${status.lastError ?? ''}`
          );
        }
        return;
      }
      const done = running.reduce((n, job) => n + job.done, 0);
      const total = running.reduce((n, job) => n + job.total, 0);
      downloadStatus.text = `$(cloud-download) ${done}/${total}`;
      downloadStatus.tooltip = 'Downloading chapters. Click to cancel.';
      downloadStatus.show();
    })
  );
  restoreLastBook(progress, nowReading);

  const watchPattern = `**/*.{${allExtensions().map((ext) => ext.slice(1)).join(',')}}`;
  const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);
  const onBookFileChange = (uri: vscode.Uri) => {
    library.invalidate(uri.fsPath);
    tree.refresh();
  };
  watcher.onDidCreate(onBookFileChange);
  watcher.onDidChange(onBookFileChange);
  watcher.onDidDelete(onBookFileChange);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('openReader.libraryFolders')) {
        tree.refresh();
      }
      if (isReaderPrefsChange(e, 'main')) {
        reader.applyPrefs(loadReaderPrefs('main'));
      }
      if (isReaderPrefsChange(e, 'side')) {
        nowReading.applyPrefs(loadReaderPrefs('side'));
      }
    })
  );
}

/**
 * Re-open the book the reader left off on. Deliberately quiet: it only primes the
 * sidebar view, so nothing steals focus or opens an editor tab at startup.
 *
 * Must stay synchronous. The view resolves as soon as the container is opened, and an
 * await here loses that race, the view renders its empty state and never hears that a
 * book was restored. A book that no longer exists is handled when it fails to render.
 */
function restoreLastBook(progress: ProgressStore, nowReading: NowReadingViewProvider): void {
  if (!vscode.workspace.getConfiguration('openReader').get<boolean>('restoreLastBook', true)) {
    return;
  }

  const last = progress.getLastRead();
  if (last) {
    nowReading.restore(last.filePath, last.chapterIndex);
  }
}

function debounceTimer(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export function deactivate(): Thenable<void> | undefined {
  // The debounced scroll write may still be in flight when the window closes.
  return flushPendingState?.();
}
