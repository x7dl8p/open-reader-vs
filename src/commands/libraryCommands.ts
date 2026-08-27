import * as vscode from 'vscode';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';

export function registerLibraryCommands(context: vscode.ExtensionContext, tree: LibraryTreeProvider): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bookReader.refreshLibrary', () => tree.refresh()),
    vscode.commands.registerCommand('bookReader.chooseLibraryFolder', () => chooseLibraryFolder(tree)),
    vscode.commands.registerCommand('bookReader.openSettings', () => openSettings(context))
  );
}

async function chooseLibraryFolder(tree: LibraryTreeProvider): Promise<void> {
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
}

function openSettings(context: vscode.ExtensionContext): void {
  vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`);
}
