import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { ProgressStore } from '../epub/progress';
import type { NovelItem } from './types';
import { errorMessage, SourceManager } from './sourceManager';
import type { NovelStore } from './novelStore';
import type { ReadStore } from '../epub/readStore';
import type { DownloadQueue, DownloadStatus } from './downloadQueue';
import { fetchApi } from './runtime/fetch';

type Request = { id: number; method: string; params: Record<string, unknown> };

export interface BrowseServices {
  sources: SourceManager;
  novels: NovelStore;
  progress: ProgressStore;
  readStore: ReadStore;
  downloads: DownloadQueue;
}

export interface BrowseHost {
  /** Open a saved novel's chapter in the editor-area reader. */
  read(filePath: string, index: number): Promise<void>;
  /** The library changed (a novel was added or removed). */
  libraryChanged(): void;
  importLink(url: string): Promise<{ kind: 'book' | 'novel'; title: string; sourceId?: string; path?: string } | undefined>;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * The "Browse Sources" page: an editor-area webview laid out like VS Code's own
 * Extensions view. Sources are listed and installed on the left; the right side browses
 * one source, then shows a novel with its chapters and an "Add to Library" button.
 *
 * The page talks to the extension through request/response messages; every source call
 * runs here in the extension host, where the plugins live.
 */
export class BrowsePanel {
  static readonly viewType = 'openReaderBrowse';
  private panel?: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private readonly sources: SourceManager;
  private readonly novels: NovelStore;
  private readonly progress: ProgressStore;
  private readonly readStore: ReadStore;
  private readonly downloads: DownloadQueue;

  constructor(private extensionUri: vscode.Uri, services: BrowseServices, private host: BrowseHost) {
    ({ sources: this.sources, novels: this.novels, progress: this.progress, readStore: this.readStore, downloads: this.downloads } =
      services);
  }

  open(focus?: { sourceId?: string; novelPath?: string }): void {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.create();
    }
    if (focus) {
      void this.panel?.webview.postMessage({ type: 'focus', ...focus });
    }
  }

  /** Tell an open page that the library or installed sources changed. */
  notifyChanged(): void {
    void this.panel?.webview.postMessage({ type: 'changed' });
  }

  /** A book's read/bookmark marks changed; the page re-reads them if it shows that book. */
  notifyState(filePath: string): void {
    void this.panel?.webview.postMessage({ type: 'state', filePath });
  }

  notifyDownload(status: DownloadStatus): void {
    void this.panel?.webview.postMessage({ type: 'download', status });
  }

  private create(): void {
    const media = vscode.Uri.joinPath(this.extensionUri, 'media', 'browse');
    const codicons = vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons');
    const panel = vscode.window.createWebviewPanel(BrowsePanel.viewType, 'Browse Sources', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [media, codicons],
    });
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.png');
    panel.webview.html = this.html(panel.webview, media, codicons);
    panel.webview.onDidReceiveMessage((msg: Request) => void this.handle(msg), undefined, this.disposables);
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    });
    this.disposables.push(this.sources.onDidChange(() => this.notifyChanged()));
    this.panel = panel;
  }

  private async handle(msg: Request): Promise<void> {
    if (!this.panel || typeof msg?.id !== 'number') {
      return;
    }
    try {
      const result = await this.dispatch(msg.method, msg.params ?? {});
      void this.panel?.webview.postMessage({ type: 'response', id: msg.id, result });
    } catch (err) {
      void this.panel?.webview.postMessage({ type: 'response', id: msg.id, error: friendlyError(err) });
    }
  }

  private async dispatch(method: string, p: Record<string, unknown>): Promise<unknown> {
    const str = (key: string) => String(p[key] ?? '');
    switch (method) {
      case 'catalog': {
        const items = await this.sources.listAvailable(Boolean(p.force));
        const updates = await this.sources.updatesAvailable().catch(() => []);
        return { items, installed: this.sources.installed(), updates: updates.map((u) => u.id) };
      }
      case 'install': {
        const items = await this.sources.listAvailable();
        const item = items.find((i) => i.id === str('sourceId'));
        if (!item) {
          throw new Error('That source is no longer in any repository.');
        }
        await this.sources.install(item);
        return { installed: this.sources.installed() };
      }
      case 'uninstall':
        await this.sources.uninstall(str('sourceId'));
        return { installed: this.sources.installed() };
      case 'sourceInfo': {
        const plugin = await this.sources.load(str('sourceId'));
        return { filters: plugin.filters ?? {}, site: plugin.site, version: plugin.version };
      }
      case 'browse': {
        const plugin = await this.sources.load(str('sourceId'));
        const page = Number(p.page ?? 1);
        let items: NovelItem[];
        if (p.mode === 'search') {
          items = await plugin.searchNovels(str('query'), page);
        } else {
          const filters = { ...SourceManager.defaultFilters(plugin), ...((p.filters as object) ?? {}) };
          items = await plugin.popularNovels(page, { showLatestNovels: p.mode === 'latest', filters });
        }
        const list = Array.isArray(items) ? items : [];
        if (page === 1 && list.length === 0 && p.mode !== 'search') {
          throw new Error(
            `${plugin.name} returned no novels. The site may be down, or blocking automated readers with a bot check.`
          );
        }
        return { items: list.map((n) => ({ name: String(n.name ?? ''), path: n.path, cover: n.cover })) };
      }
      case 'novel': {
        const sourceId = str('sourceId');
        const novelPath = str('path');
        const cached = await this.novels.find(sourceId, novelPath);
        // Opening a novel from the grid refreshes a stale save; re-renders after a state
        // change (p.cachedOk) never touch the network.
        const stale = !cached || (!p.cachedOk && Date.now() - cached.novel.updatedAt > 60 * 60 * 1000);
        const saved = p.refresh || stale ? await this.novels.fetchAndSave(sourceId, novelPath) : cached;
        return { ...saved.novel, filePath: saved.filePath, ...(await this.chapterState(saved.filePath)) };
      }
      case 'chapterState':
        return this.chapterState(str('filePath'));
      case 'setRead':
        await this.readStore.setRead(str('filePath'), indexes(p), Boolean(p.read));
        return {};
      case 'markPreviousRead':
        await this.readStore.markPreviousRead(str('filePath'), Number(p.index));
        return {};
      case 'setBookmark':
        await this.readStore.setBookmarked(str('filePath'), indexes(p), Boolean(p.on));
        return {};
      case 'download':
        this.downloads.enqueue(str('filePath'), indexes(p));
        return {};
      case 'cancelDownload':
        this.downloads.cancel(str('filePath'));
        return {};
      case 'deleteDownloads':
        await this.novels.deleteDownloads(str('filePath'), indexes(p));
        this.host.libraryChanged();
        return this.chapterState(str('filePath'));
      case 'setLibrary': {
        const novel = await this.novels.setInLibrary(str('filePath'), Boolean(p.inLibrary));
        this.host.libraryChanged();
        return { inLibrary: novel.inLibrary };
      }
      case 'read':
        await this.host.read(str('filePath'), Number(p.index ?? 0));
        return {};
      case 'image':
        return { dataUrl: await this.proxyImage(str('sourceId'), str('url')) };
      case 'importLink':
        return (await this.host.importLink(str('url'))) ?? null;
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(str('url')));
        return {};
      case 'repositories':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'openReader.sourceRepositories');
        return {};
      default:
        throw new Error(`Unknown request ${method}`);
    }
  }

  private async chapterState(filePath: string) {
    const { read, bookmarks } = this.readStore.get(filePath);
    return {
      progress: this.progress.get(filePath),
      read: [...read],
      bookmarks: [...bookmarks],
      downloaded: [...(await this.novels.downloadedIndexes(filePath).catch(() => new Set<number>()))],
      download: this.downloads.status(filePath) ?? null,
    };
  }

  /**
   * Covers that need a Referer or cookie fail to load straight into the webview, which
   * cannot send custom headers. The page asks for those here, fetched with the plugin's
   * imageRequestInit, and gets them back as data URLs.
   */
  private async proxyImage(sourceId: string, url: string): Promise<string> {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Not an image URL');
    }
    let headers: Record<string, string> = {};
    try {
      const plugin = await this.sources.load(sourceId);
      headers = { Referer: plugin.site, ...(plugin.imageRequestInit?.headers ?? {}) };
    } catch {
      // Not installed, fetch without the plugin's headers.
    }
    const res = await fetchApi(url, { headers });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) {
      throw new Error(`Image failed (HTTP ${res.status})`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error('Image too large');
    }
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
  }

  private html(webview: vscode.Webview, media: vscode.Uri, codicons: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const asset = (base: vscode.Uri, file: string) => webview.asWebviewUri(vscode.Uri.joinPath(base, file)).toString();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset(codicons, 'codicon.css')}">
<link rel="stylesheet" href="${asset(media, 'browse.css')}">
<title>Browse Sources</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${asset(media, 'browse.js')}"></script>
</body>
</html>`;
  }
}

function indexes(p: Record<string, unknown>): number[] {
  return Array.isArray(p.indexes) ? p.indexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0) : [];
}

function friendlyError(err: unknown): string {
  const message = errorMessage(err);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|aborted|timeout/i.test(message)) {
    return `Could not reach the site (${message}). Check your connection, or the site may be down.`;
  }
  if (/Cannot read properties of undefined|is not a function|Unexpected token '<'/i.test(message)) {
    return `The source could not read the site's page (${message}). The site may have changed or be showing a bot check.`;
  }
  return message;
}
