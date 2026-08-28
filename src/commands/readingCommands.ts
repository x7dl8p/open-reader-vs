import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { ChapterItem } from '../tree/chapterItem';
import type { NowReadingViewProvider } from '../content/nowReadingView';
import type { ReaderPanel } from '../content/readerPanel';
import { PROSE_LANGUAGE, tocUri } from '../content/uris';

interface ReadingDeps {
  library: Library;
  progress: ProgressStore;
  tree: LibraryTreeProvider;
  nowReading: NowReadingViewProvider;
  reader: ReaderPanel;
}

export function registerReadingCommands(context: vscode.ExtensionContext, deps: ReadingDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openReader.openToc', (filePath: string) => openToc(filePath, deps)),
    vscode.commands.registerCommand('openReader.openChapter', (item: ChapterItem) => openChapter(item.filePath, item.index, deps)),
    vscode.commands.registerCommand('openReader.openInNowReading', (item: ChapterItem) =>
      openInNowReading(item.filePath, item.index, deps)
    ),
    vscode.commands.registerCommand('openReader.nextChapter', () => deps.reader.step(1)),
    vscode.commands.registerCommand('openReader.previousChapter', () => deps.reader.step(-1)),
    vscode.commands.registerCommand('openReader.backToToc', () => deps.reader.backToToc())
  );
}

async function openToc(filePath: string, { library }: ReadingDeps): Promise<void> {
  const meta = await library.getMeta(filePath);
  const doc = await vscode.workspace.openTextDocument(tocUri(filePath, meta.title));
  await vscode.languages.setTextDocumentLanguage(doc, PROSE_LANGUAGE);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openChapter(filePath: string, index: number, { reader }: ReadingDeps): Promise<void> {
  await reader.show(filePath, index);
}

async function openInNowReading(filePath: string, index: number, { library, progress, tree, nowReading }: ReadingDeps): Promise<void> {
  const meta = await library.getMeta(filePath);
  const clampedIndex = Math.max(0, Math.min(index, meta.totalChapters - 1));
  await nowReading.show(filePath, clampedIndex);
  await progress.set(filePath, clampedIndex);
  tree.refresh();
}
