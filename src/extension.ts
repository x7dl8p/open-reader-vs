import * as path from 'path';
import * as vscode from 'vscode';
import { Library } from './epub/library';
import { ProgressStore } from './epub/progress';
import { LibraryTreeProvider } from './tree/libraryTree';
import { ChapterContentProvider } from './content/chapterProvider';
import { TocContentProvider } from './content/tocProvider';
import { CHAPTER_SCHEME, TOC_SCHEME } from './content/uris';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const library = new Library(path.join(context.globalStorageUri.fsPath, 'images'));
  const progress = new ProgressStore(context);
  const tree = new LibraryTreeProvider(library, progress);

  context.subscriptions.push(
    vscode.window.createTreeView('bookReaderLibrary', { treeDataProvider: tree, showCollapseAll: true }),
    vscode.workspace.registerTextDocumentContentProvider(CHAPTER_SCHEME, new ChapterContentProvider(library)),
    vscode.workspace.registerTextDocumentContentProvider(TOC_SCHEME, new TocContentProvider(library))
  );

  registerCommands(context, library, progress, tree);

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
