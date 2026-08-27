import * as path from 'path';
import * as vscode from 'vscode';
import { Library } from './epub/library';
import { ProgressStore } from './epub/progress';
import { LibraryTreeProvider } from './tree/libraryTreeProvider';
import { ChapterContentProvider } from './content/chapterProvider';
import { TocContentProvider } from './content/tocProvider';
import { NowReadingViewProvider } from './content/nowReadingView';
import { CHAPTER_SCHEME, TOC_SCHEME } from './content/uris';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const imagesDir = path.join(context.globalStorageUri.fsPath, 'images');
  const library = new Library(imagesDir);
  const progress = new ProgressStore(context);
  const tree = new LibraryTreeProvider(library, progress);
  const nowReading = new NowReadingViewProvider(library, progress, vscode.Uri.file(imagesDir));

  context.subscriptions.push(
    vscode.window.createTreeView('bookReaderLibrary', { treeDataProvider: tree, showCollapseAll: true }),
    vscode.window.registerWebviewViewProvider(NowReadingViewProvider.viewType, nowReading),
    vscode.workspace.registerTextDocumentContentProvider(CHAPTER_SCHEME, new ChapterContentProvider(library)),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  registerCommands(context, library, progress, tree, nowReading);

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.epub');
  const onEpubChange = (uri: vscode.Uri) => {
    library.invalidate(uri.fsPath);
    tree.refresh();
  };
  watcher.onDidCreate(onEpubChange);
  watcher.onDidChange(onEpubChange);
  watcher.onDidDelete(onEpubChange);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('bookReader.libraryFolders')) {
        tree.refresh();
      }
    })
  );
}

export function deactivate(): void {}
