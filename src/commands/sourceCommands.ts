import * as path from 'path';
import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { LibraryTreeProvider } from '../tree/libraryTreeProvider';
import type { BookItem } from '../tree/bookItem';
import type { SourceManager } from '../sources/sourceManager';
import type { NovelStore } from '../sources/novelStore';
import type { BrowsePanel } from '../sources/browsePanel';
import type { SourceItem } from '../sources/types';
import { importFromLink } from '../sources/importLink';
import { errorMessage } from '../sources/sourceManager';

export interface SourceDeps {
  sources: SourceManager;
  novels: NovelStore;
  library: Library;
  tree: LibraryTreeProvider;
  browse: BrowsePanel;
  progress: ProgressStore;
}

export function registerSourceCommands(context: vscode.ExtensionContext, deps: SourceDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openReader.browseSources', () => deps.browse.open()),
    vscode.commands.registerCommand('openReader.importFromLink', () => promptImport(deps)),
    vscode.commands.registerCommand('openReader.showInSources', (item: BookItem) => showInSources(item, deps)),
    vscode.commands.registerCommand('openReader.refreshNovel', (item: BookItem) => refreshNovel(item, deps)),
    vscode.commands.registerCommand('openReader.removeFromLibrary', (item: BookItem) => removeFromLibrary(item, deps))
  );
}

async function promptImport(deps: SourceDeps): Promise<void> {
  const clip = (await vscode.env.clipboard.readText()).trim();
  const url = await vscode.window.showInputBox({
    title: 'Import from Link',
    prompt: 'A novel page from a site a source serves, or a direct .epub / .cbz link',
    placeHolder: 'https://…',
    value: /^https?:\/\/\S+$/i.test(clip) ? clip : '',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() && !/^\S+\.\S+/.test(value.trim()) ? 'Enter a link' : undefined),
  });
  if (!url?.trim()) {
    return;
  }
  try {
    const result = await runImport(url, deps);
    if (!result) {
      return;
    }
    const action = await vscode.window.showInformationMessage(
      `Added “${result.title}” to the library.`,
      ...(result.kind === 'novel' ? ['Show Novel'] : [])
    );
    if (action === 'Show Novel' && result.sourceId && result.path) {
      deps.browse.open({ sourceId: result.sourceId, novelPath: result.path });
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Import failed: ${errorMessage(err)}`);
  }
}

/** Shared by the command and the Browse page. Throws on failure; undefined means cancelled. */
export async function runImport(
  url: string,
  deps: SourceDeps
): Promise<{ kind: 'book' | 'novel'; title: string; sourceId?: string; path?: string } | undefined> {
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Importing from link…' },
    () =>
      importFromLink(url, {
        sources: deps.sources,
        novels: deps.novels,
        downloadsDir: deps.library.downloadsDir,
        chooseSource: (candidates, host) => chooseSource(candidates, host),
      })
  );
  if (!result) {
    return undefined;
  }
  deps.tree.refresh();
  deps.browse.notifyChanged();
  if (result.kind === 'book') {
    let title = path.basename(result.filePath);
    try {
      title = (await deps.library.getMeta(result.filePath)).title;
    } catch {
      // Keep the file name.
    }
    return { kind: 'book', title };
  }
  return { kind: 'novel', title: result.novel.name, sourceId: result.novel.sourceId, path: result.novel.path };
}

async function chooseSource(candidates: SourceItem[], host: string): Promise<SourceItem | undefined> {
  if (candidates.length === 1) {
    const [only] = candidates;
    const install = await vscode.window.showInformationMessage(
      `${host} is served by the “${only.name}” source (${only.lang}). Install it to import this novel?`,
      { modal: true },
      'Install and Import'
    );
    return install ? only : undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((item) => ({ label: item.name, description: `${item.lang} · v${item.version}`, detail: item.site, item })),
    { title: `Several sources serve ${host}. Pick one to install.`, ignoreFocusOut: true }
  );
  return picked?.item;
}

async function showInSources(item: BookItem, { novels, browse }: SourceDeps): Promise<void> {
  const novel = await novels.read(item.book.filePath);
  browse.open({ sourceId: novel.sourceId, novelPath: novel.path });
}

async function refreshNovel(item: BookItem, { novels, tree, browse }: SourceDeps): Promise<void> {
  try {
    const before = await novels.read(item.book.filePath);
    const { novel } = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Checking “${before.name}” for new chapters…` },
      () => novels.fetchAndSave(before.sourceId, before.path)
    );
    tree.refresh();
    browse.notifyChanged();
    const added = novel.chapters.length - before.chapters.length;
    void vscode.window.showInformationMessage(
      added > 0 ? `${added} new chapter${added === 1 ? '' : 's'} in “${novel.name}”.` : `“${novel.name}” is up to date.`
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Refresh failed: ${errorMessage(err)}`);
  }
}

async function removeFromLibrary(item: BookItem, { novels, tree, browse }: SourceDeps): Promise<void> {
  await novels.setInLibrary(item.book.filePath, false);
  tree.refresh();
  browse.notifyChanged();
}
