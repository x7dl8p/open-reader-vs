import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { ReadStore } from '../epub/readStore';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { NowReadingViewProvider } from '../content/nowReadingView';
import type { ReaderPanel } from '../content/readerPanel';
import type { SettingsPanel } from '../content/settingsView';
import type { AboutPanel } from '../content/aboutView';
import { registerLibraryCommands } from './libraryCommands';
import { registerReadingCommands } from './readingCommands';

export function registerCommands(
  context: vscode.ExtensionContext,
  library: Library,
  progress: ProgressStore,
  readStore: ReadStore,
  tree: LibraryTreeProvider,
  nowReading: NowReadingViewProvider,
  reader: ReaderPanel,
  settings: SettingsPanel,
  about: AboutPanel
): void {
  registerLibraryCommands(context, tree, settings, about);
  registerReadingCommands(context, { library, progress, readStore, tree, nowReading, reader });
}
