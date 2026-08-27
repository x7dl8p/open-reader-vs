import * as path from 'path';
import * as vscode from 'vscode';
import { Library } from './epub/library';
import { ProgressStore } from './epub/progress';
import { isReaderPrefsChange, loadReaderPrefs } from './epub/readerPrefs';
import { LibraryTreeProvider } from './tree/libraryTreeProvider';
import { ChapterContentProvider } from './content/chapterProvider';
import { TocContentProvider } from './content/tocProvider';
import { NowReadingViewProvider } from './content/nowReadingView';
import { SettingsPanel } from './content/settingsView';
import { CHAPTER_SCHEME, TOC_SCHEME } from './content/uris';
import { registerCommands } from './commands';
import { allExtensions } from './epub/formats';

export function activate(context: vscode.ExtensionContext): void {
  const imagesDir = path.join(context.globalStorageUri.fsPath, 'images');
  const library = new Library(imagesDir);
  const progress = new ProgressStore(context);
  const tree = new LibraryTreeProvider(library, progress);
  const nowReading = new NowReadingViewProvider(library, progress, vscode.Uri.file(imagesDir));
  const settings = new SettingsPanel(nowReading);

  context.subscriptions.push(
    vscode.window.createTreeView('openReaderLibrary', { treeDataProvider: tree, showCollapseAll: true }),
    vscode.window.registerWebviewViewProvider(NowReadingViewProvider.viewType, nowReading),
    vscode.workspace.registerTextDocumentContentProvider(CHAPTER_SCHEME, new ChapterContentProvider(library)),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  registerCommands(context, library, progress, tree, nowReading, settings);

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
        nowReading.applyPrefs(loadReaderPrefs());
      }
    })
  );
}

export function deactivate(): void {}
