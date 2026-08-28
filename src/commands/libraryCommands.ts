import * as vscode from 'vscode';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { SettingsPanel } from '../content/settingsView';
import type { AboutPanel } from '../content/aboutView';

export function registerLibraryCommands(
  context: vscode.ExtensionContext,
  tree: LibraryTreeProvider,
  settings: SettingsPanel,
  about: AboutPanel
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openReader.refreshLibrary', () => tree.refresh()),
    vscode.commands.registerCommand('openReader.chooseLibraryFolder', () => chooseLibraryFolder(tree)),
    vscode.commands.registerCommand('openReader.openSettings', () => settings.open()),
    vscode.commands.registerCommand('openReader.showFiles', () => tree.setViewMode('files')),
    vscode.commands.registerCommand('openReader.showLibrary', () => tree.setViewMode('library')),
    vscode.commands.registerCommand('openReader.showAbout', () => about.open())
  );
}

async function chooseLibraryFolder(tree: LibraryTreeProvider): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Add to Library',
  });
  if (!picked || picked.length === 0) {
    return;
  }

  const config = vscode.workspace.getConfiguration('openReader');
  const current = config.get<string[]>('libraryFolders') ?? [];
  const next = Array.from(new Set([...current, picked[0].fsPath]));
  await config.update('libraryFolders', next, vscode.ConfigurationTarget.Global);
  tree.refresh();
}
