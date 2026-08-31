import * as path from 'path';
import * as vscode from 'vscode';
import { Library } from './epub/library';
import { ProgressStore } from './epub/progress';
import { ScrollStore } from './epub/scrollStore';
import { isReaderPrefsChange, loadReaderPrefs } from './epub/readerPrefs';
import { LibraryTreeProvider } from './tree/libraryTreeProvider';
import { TocContentProvider } from './content/tocProvider';
import { NowReadingViewProvider } from './content/nowReadingView';
import { ReaderPanel } from './content/readerPanel';
import { SettingsPanel } from './content/settingsView';
import { AboutPanel } from './content/aboutView';
import { TOC_SCHEME } from './content/uris';
import { registerCommands } from './commands';
import { allExtensions } from './epub/formats';

let flushPendingState: (() => Promise<void>) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const imagesDir = path.join(context.globalStorageUri.fsPath, 'images');
  const library = new Library(imagesDir);
  const progress = new ProgressStore(context);
  const scroll = new ScrollStore(context);
  flushPendingState = () => scroll.flush();
  const tree = new LibraryTreeProvider(library, progress);
  const treeView = vscode.window.createTreeView('openReaderLibrary', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  tree.attachView(treeView);

  const markAsReading = (filePath: string, index: number) => tree.markReading(filePath, index);
  const nowReading = new NowReadingViewProvider(library, progress, scroll, vscode.Uri.file(imagesDir), markAsReading);
  const reader = new ReaderPanel(
    library,
    progress,
    scroll,
    vscode.Uri.file(imagesDir),
    vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png'),
    markAsReading
  );
  const settings = new SettingsPanel([nowReading, reader]);
  const { displayName, version } = context.extension.packageJSON as { displayName?: string; version?: string };
  const about = new AboutPanel(context.extensionUri, displayName ?? 'Open Reader', version ?? '');

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider(NowReadingViewProvider.viewType, nowReading, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  registerCommands(context, library, progress, tree, nowReading, reader, settings, about);
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
      if (isReaderPrefsChange(e)) {
        const prefs = loadReaderPrefs();
        nowReading.applyPrefs(prefs);
        reader.applyPrefs(prefs);
      }
    })
  );
}

/**
 * Re-open the book the reader left off on. Deliberately quiet: it only primes the
 * sidebar view, so nothing steals focus or opens an editor tab at startup.
 *
 * Must stay synchronous. The view resolves as soon as the container is opened, and an
 * await here loses that race — the view renders its empty state and never hears that a
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

export function deactivate(): Thenable<void> | undefined {
  // The debounced scroll write may still be in flight when the window closes.
  return flushPendingState?.();
}
