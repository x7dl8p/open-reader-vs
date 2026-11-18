import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ReadStore } from '../epub/readStore';
import type { TitleStore } from '../epub/titleStore';

type Message = { type: 'open' | 'remove'; filePath: string; index: number } | { type: 'ready' };

interface BookmarkGroup {
  filePath: string;
  title: string;
  online: boolean;
  total: number;
  chapters: Array<{ index: number; label: string; read: boolean }>;
}

/**
 * The Bookmarks page: every bookmarked chapter, grouped by book, in the editor area.
 * Opened from the Library's ··· menu. Clicking a chapter opens it in the Reader.
 */
export class BookmarksPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private readonly subscriptions: vscode.Disposable[];
  /** Bumped per refresh, so a slow older refresh never overwrites a newer one. */
  private refreshSeq = 0;

  constructor(
    private extensionUri: vscode.Uri,
    private library: Library,
    private readStore: ReadStore,
    titles: TitleStore
  ) {
    this.subscriptions = [readStore.onDidChange(() => void this.refresh()), titles.onDidChange(() => void this.refresh())];
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
    this.panel?.dispose();
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      void this.refresh();
      return;
    }
    const codicons = vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons');
    const panel = vscode.window.createWebviewPanel('openReaderBookmarks', 'Bookmarks', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [codicons],
    });
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.png');
    panel.webview.html = this.html(panel.webview, codicons);
    panel.webview.onDidReceiveMessage((msg: Message) => void this.handle(msg));
    panel.onDidDispose(() => (this.panel = undefined));
    this.panel = panel;
  }

  private async handle(msg: Message): Promise<void> {
    try {
      if (msg.type === 'ready') {
        await this.refresh();
      } else if (msg.type === 'open') {
        await vscode.commands.executeCommand('openReader.openInNowReading', { filePath: msg.filePath, index: msg.index });
      } else if (msg.type === 'remove') {
        await this.readStore.setBookmarked(msg.filePath, [msg.index], false);
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Could not open the bookmark: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const seq = ++this.refreshSeq;
    const groups = await this.groups();
    if (seq === this.refreshSeq) {
      void this.panel?.webview.postMessage({ type: 'data', groups });
    }
  }

  private async groups(): Promise<BookmarkGroup[]> {
    const byBook = new Map<string, number[]>();
    for (const { filePath, index } of this.readStore.allBookmarks()) {
      const list = byBook.get(filePath) ?? [];
      list.push(index);
      byBook.set(filePath, list);
    }
    const groups: BookmarkGroup[] = [];
    for (const [filePath, indexes] of byBook) {
      let meta;
      try {
        meta = await this.library.getMeta(filePath);
      } catch {
        continue; // The book is gone.
      }
      const { read } = this.readStore.get(filePath);
      groups.push({
        filePath,
        title: meta.title,
        online: this.library.isOnline(filePath),
        total: meta.totalChapters,
        chapters: indexes
          .sort((a, b) => a - b)
          .map((index) => ({ index, label: meta.toc[index]?.label ?? `Chapter ${index + 1}`, read: read.has(index) })),
      });
    }
    return groups.sort((a, b) => a.title.localeCompare(b.title));
  }

  private html(webview: vscode.Webview, codicons: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const codiconCss = webview.asWebviewUri(vscode.Uri.joinPath(codicons, 'codicon.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${codiconCss}">
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 20px 28px 48px; font-family: var(--vscode-font-family); font-size: 13px;
  color: var(--vscode-foreground); background: var(--vscode-editor-background); }
main { max-width: 900px; }
h1 { margin: 0 0 4px; font-size: 22px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.sub { opacity: .7; margin: 0 0 22px; }
.book { margin-bottom: 22px; }
.book-head { display: flex; align-items: baseline; gap: 8px; padding-bottom: 6px; margin-bottom: 4px;
  border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,.3))); }
.book-head .title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.book-head .count { opacity: .6; font-size: 12px; }
.book-head .codicon { font-size: 13px; opacity: .7; }
.row { display: flex; align-items: center; gap: 12px; height: 30px; padding: 0 6px; border-radius: 3px; cursor: pointer; }
.row:hover { background: var(--vscode-list-hoverBackground); }
.row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.num { width: 44px; text-align: right; opacity: .55; font-size: 12px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row.read .name, .row.read .num { opacity: .25; }
.remove { opacity: 0; border: none; background: none; color: var(--vscode-icon-foreground, var(--vscode-foreground));
  width: 22px; height: 22px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.row:hover .remove { opacity: .85; }
.remove:hover { background: var(--vscode-toolbar-hoverBackground); }
.empty { padding: 40px 0; text-align: center; opacity: .75; line-height: 1.6; }
.empty .codicon { font-size: 40px; opacity: .35; display: block; margin-bottom: 10px; }
</style>
<title>Bookmarks</title>
</head>
<body>
<main>
  <h1><i class="codicon codicon-bookmark"></i> Bookmarks</h1>
  <p class="sub" id="sub"></p>
  <div id="list"></div>
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const list = document.getElementById('list');
const sub = document.getElementById('sub');
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; }
function render(groups) {
  list.replaceChildren();
  const total = groups.reduce((n, g) => n + g.chapters.length, 0);
  sub.textContent = total ? total + ' bookmarked chapter' + (total === 1 ? '' : 's') + ' in ' + groups.length + ' book' + (groups.length === 1 ? '' : 's') + '. Click one to open it in the Reader.' : '';
  if (!total) {
    const empty = el('div', 'empty');
    empty.append(el('i', 'codicon codicon-bookmark'), el('div', '', 'No bookmarks yet.'),
      el('div', '', 'Right-click a chapter in the Library and choose Bookmark, or select chapters on a novel page and press Bookmark.'));
    list.append(empty);
    return;
  }
  for (const g of groups) {
    const book = el('section', 'book');
    const head = el('div', 'book-head');
    head.append(el('i', 'codicon codicon-' + (g.online ? 'globe' : 'book')), el('span', 'title', g.title), el('span', 'count', g.chapters.length + ' of ' + g.total));
    book.append(head);
    for (const c of g.chapters) {
      const row = el('div', 'row' + (c.read ? ' read' : ''));
      row.tabIndex = 0;
      row.title = 'Open in the Reader';
      const open = () => vscode.postMessage({ type: 'open', filePath: g.filePath, index: c.index });
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') { open(); } });
      const remove = el('button', 'remove');
      remove.title = 'Remove bookmark';
      remove.append(el('i', 'codicon codicon-trash'));
      remove.addEventListener('click', (e) => { e.stopPropagation(); vscode.postMessage({ type: 'remove', filePath: g.filePath, index: c.index }); });
      row.append(el('span', 'num', String(c.index + 1)), el('span', 'name', c.label), remove);
      book.append(row);
    }
    list.append(book);
  }
}
window.addEventListener('message', (e) => { if (e.data.type === 'data') { render(e.data.groups); } });
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
