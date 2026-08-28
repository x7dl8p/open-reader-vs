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

export function activate(context: vscode.ExtensionContext): void {
  const imagesDir = path.join(context.globalStorageUri.fsPath, 'images');
  const library = new Library(imagesDir);
  const progress = new ProgressStore(context);
  const scroll = new ScrollStore(context);
  const tree = new LibraryTreeProvider(library, progress);
  const nowReading = new NowReadingViewProvider(library, progress, scroll, vscode.Uri.file(imagesDir));
  const reader = new ReaderPanel(
    library,
    progress,
    scroll,
    vscode.Uri.file(imagesDir),
    vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png'),
    () => tree.refresh()
  );
  const settings = new SettingsPanel([nowReading, reader]);
  const { displayName, version } = context.extension.packageJSON as { displayName?: string; version?: string };
  const about = new AboutPanel(context.extensionUri, displayName ?? 'Open Reader', version ?? '');

  context.subscriptions.push(
    vscode.window.createTreeView('openReaderLibrary', { treeDataProvider: tree, showCollapseAll: true }),
    vscode.window.registerWebviewViewProvider(NowReadingViewProvider.viewType, nowReading, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  registerCommands(context, library, progress, tree, nowReading, reader, settings, about);

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

export function deactivate(): void {}
