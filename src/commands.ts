import * as vscode from 'vscode';
import type { Library } from './epub/library';
import type { ProgressStore } from './epub/progress';
import type { LibraryTreeProvider } from './tree/libraryTree';
import type { ChapterItem } from './tree/libraryTree';
import type { NowReadingViewProvider } from './content/nowReadingView';
import { CHAPTER_SCHEME, PROSE_LANGUAGE, chapterUri, parseChapterQuery, tocUri } from './content/uris';

export function registerCommands(
  context: vscode.ExtensionContext,
  library: Library,
  progress: ProgressStore,
  tree: LibraryTreeProvider,
  nowReading: NowReadingViewProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bookReader.refreshLibrary', () => tree.refresh()),

    vscode.commands.registerCommand('bookReader.chooseLibraryFolder', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Add to Library',
      });
      if (!picked || picked.length === 0) {return;}

      const config = vscode.workspace.getConfiguration('bookReader');
      const current = config.get<string[]>('libraryFolders') ?? [];
      const next = Array.from(new Set([...current, picked[0].fsPath]));
      await config.update('libraryFolders', next, vscode.ConfigurationTarget.Global);
      tree.refresh();
    }),

    vscode.commands.registerCommand('bookReader.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`);
    }),

    vscode.commands.registerCommand('bookReader.openToc', async (filePath: string) => {
      const meta = await library.getMeta(filePath);
      const uri = tocUri(filePath, meta.title);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.languages.setTextDocumentLanguage(doc, PROSE_LANGUAGE);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),

    vscode.commands.registerCommand('bookReader.openChapter', async (item: ChapterItem) => {
      await openChapter(library, progress, tree, item.filePath, item.index);
    }),

    vscode.commands.registerCommand('bookReader.openInNowReading', async (item: ChapterItem) => {
      await nowReading.show(item.filePath, item.index);
      await progress.set(item.filePath, item.index);
      tree.refresh();
    }),

    vscode.commands.registerCommand('bookReader.nextChapter', () => stepChapter(library, progress, tree, 1)),
    vscode.commands.registerCommand('bookReader.previousChapter', () => stepChapter(library, progress, tree, -1)),

    vscode.commands.registerCommand('bookReader.backToToc', () => {
      const active = vscode.window.activeTextEditor?.document.uri;
      if (!active || active.scheme !== CHAPTER_SCHEME) {return;}
      const { filePath } = parseChapterQuery(active);
      return vscode.commands.executeCommand('bookReader.openToc', filePath);
    })
  );
}

async function openChapter(
  library: Library,
  progress: ProgressStore,
  tree: LibraryTreeProvider,
  filePath: string,
  index: number
): Promise<void> {
  const meta = await library.getMeta(filePath);
  const clamped = Math.max(0, Math.min(index, meta.totalChapters - 1));
  const chapter = await library.getChapter(filePath, clamped);
  const uri = chapterUri(filePath, clamped, meta.title, chapter.title);

  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(doc, PROSE_LANGUAGE);
  await vscode.window.showTextDocument(doc, { preview: false });

  await progress.set(filePath, clamped);
  tree.refresh();
}

async function stepChapter(
  library: Library,
  progress: ProgressStore,
  tree: LibraryTreeProvider,
  delta: number
): Promise<void> {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active || active.scheme !== CHAPTER_SCHEME) {return;}

  const { filePath, index } = parseChapterQuery(active);
  await openChapter(library, progress, tree, filePath, index + delta);
}
