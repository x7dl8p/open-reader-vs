import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { NowReadingViewProvider } from '../content/nowReadingView';
import type { SettingsPanel } from '../content/settingsView';
import { registerLibraryCommands } from './libraryCommands';
import { registerReadingCommands } from './readingCommands';

export function registerCommands(
  context: vscode.ExtensionContext,
  library: Library,
  progress: ProgressStore,
  tree: LibraryTreeProvider,
  nowReading: NowReadingViewProvider,
  settings: SettingsPanel
): void {
  registerLibraryCommands(context, tree, settings);
  registerReadingCommands(context, { library, progress, tree, nowReading });
}
