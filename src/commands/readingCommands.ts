import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { ChapterItem } from '../tree/chapterItem';
import type { NowReadingViewProvider } from '../content/nowReadingView';
import { CHAPTER_SCHEME, PROSE_LANGUAGE, chapterUri, parseChapterQuery, tocUri } from '../content/uris';

interface ReadingDeps {
  library: Library;
  progress: ProgressStore;
  tree: LibraryTreeProvider;
  nowReading: NowReadingViewProvider;
}

export function registerReadingCommands(context: vscode.ExtensionContext, deps: ReadingDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bookReader.openToc', (filePath: string) => openToc(filePath, deps)),
    vscode.commands.registerCommand('bookReader.openChapter', (item: ChapterItem) => openChapter(item.filePath, item.index, deps)),
    vscode.commands.registerCommand('bookReader.openInNowReading', (item: ChapterItem) =>
      openInNowReading(item.filePath, item.index, deps)
    ),
    vscode.commands.registerCommand('bookReader.nextChapter', () => stepEditorChapter(1, deps)),
    vscode.commands.registerCommand('bookReader.previousChapter', () => stepEditorChapter(-1, deps)),
    vscode.commands.registerCommand('bookReader.backToToc', backToToc)
  );
}

async function openToc(filePath: string, { library }: ReadingDeps): Promise<void> {
  const meta = await library.getMeta(filePath);
  const doc = await vscode.workspace.openTextDocument(tocUri(filePath, meta.title));
  await vscode.languages.setTextDocumentLanguage(doc, PROSE_LANGUAGE);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openChapter(filePath: string, index: number, { library, progress, tree }: ReadingDeps): Promise<void> {
  const { meta, chapter, clampedIndex } = await loadClampedChapter(library, filePath, index);
  const uri = chapterUri(filePath, clampedIndex, meta.title, chapter.title);

  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(doc, PROSE_LANGUAGE);
  await vscode.window.showTextDocument(doc, { preview: false });

  await markAsReading(progress, tree, filePath, clampedIndex);
}

async function openInNowReading(filePath: string, index: number, { library, progress, tree, nowReading }: ReadingDeps): Promise<void> {
  const { clampedIndex } = await loadClampedChapter(library, filePath, index);
  await nowReading.show(filePath, clampedIndex);
  await markAsReading(progress, tree, filePath, clampedIndex);
}

async function stepEditorChapter(delta: number, deps: ReadingDeps): Promise<void> {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active || active.scheme !== CHAPTER_SCHEME) {return;}

  const { filePath, index } = parseChapterQuery(active);
  await openChapter(filePath, index + delta, deps);
}

async function backToToc(): Promise<void> {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active || active.scheme !== CHAPTER_SCHEME) {return;}

  const { filePath } = parseChapterQuery(active);
  await vscode.commands.executeCommand('bookReader.openToc', filePath);
}

async function loadClampedChapter(library: Library, filePath: string, index: number) {
  const meta = await library.getMeta(filePath);
  const clampedIndex = Math.max(0, Math.min(index, meta.totalChapters - 1));
  const chapter = await library.getChapter(filePath, clampedIndex);
  return { meta, chapter, clampedIndex };
}

async function markAsReading(progress: ProgressStore, tree: LibraryTreeProvider, filePath: string, index: number): Promise<void> {
  await progress.set(filePath, index);
  tree.refresh();
}
