import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';

/**
 * The one deliberately non-native surface: a small WebviewView stacked below the
 * Library tree ("accordion" via VS Code's own stacked-views UI). Everything else in
 * the extension is plain editor/tree/command APIs; this panel exists only because
 * rendering styled prose (bold/italic/images, independent fonts) with live prev/next
 * controls isn't something a TreeView or a plain text editor can do.
 */
export class NowReadingViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'bookReaderNowReading';

  private view?: vscode.WebviewView;
  private current?: { filePath: string; index: number };

  constructor(private library: Library, private progress: ProgressStore, private imagesRoot: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.imagesRoot],
    };
    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => this.handleMessage(msg));
    webviewView.webview.html = this.current ? this.loadingHtml() : this.emptyHtml();
    if (this.current) {
      void this.render(this.current.filePath, this.current.index);
    }
  }

  async show(filePath: string, index: number): Promise<void> {
    this.current = { filePath, index };
    if (!this.view) {
      await vscode.commands.executeCommand(`${NowReadingViewProvider.viewType}.focus`);
      return;
    }
    this.view.show?.(true);
    await this.render(filePath, index);
  }

  private async handleMessage(msg: { type: string }): Promise<void> {
    if (msg.type === 'prev') {await this.step(-1);}
    if (msg.type === 'next') {await this.step(1);}
  }

  private async step(delta: number): Promise<void> {
    if (!this.current) {return;}
    const meta = await this.library.getMeta(this.current.filePath);
    const nextIndex = Math.max(0, Math.min(this.current.index + delta, meta.totalChapters - 1));
    await this.show(this.current.filePath, nextIndex);
  }

  private async render(filePath: string, index: number): Promise<void> {
    if (!this.view) {return;}

    const [meta, chapter] = await Promise.all([this.library.getMeta(filePath), this.library.getChapter(filePath, index)]);
    await this.progress.set(filePath, index);

    const webview = this.view.webview;
    const body = rewriteImageSrcs(chapter.html, webview);

    webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
    font-size: 15px;
    line-height: 1.7;
    padding: 10px 16px 48px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
  }
  h1, h2, h3 { font-family: inherit; font-weight: 600; line-height: 1.3; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  .brm-toolbar {
    position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 4px 0 8px; margin-bottom: 10px; font-family: var(--vscode-font-family);
    font-size: 11px; opacity: 0.75; background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
  }
  .brm-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    background: none; border: 1px solid var(--vscode-button-border, rgba(128,128,128,.4));
    color: var(--vscode-foreground); border-radius: 4px; padding: 2px 8px; cursor: pointer;
    font-family: var(--vscode-font-family); font-size: 11px;
  }
  button:hover { background: var(--vscode-toolbar-hoverBackground); }
  button:disabled { opacity: 0.4; cursor: default; }
</style>
</head>
<body>
  <div class="brm-toolbar">
    <button id="prev" ${index === 0 ? 'disabled' : ''}>&larr; Prev</button>
    <span class="brm-title">${escapeHtml(meta.title)} — ${index + 1}/${meta.totalChapters}</span>
    <button id="next" ${index === meta.totalChapters - 1 ? 'disabled' : ''}>Next &rarr;</button>
  </div>
  <h1>${escapeHtml(chapter.title)}</h1>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('prev')?.addEventListener('click', () => vscode.postMessage({ type: 'prev' }));
    document.getElementById('next')?.addEventListener('click', () => vscode.postMessage({ type: 'next' }));
  </script>
</body>
</html>`;
  }

  private loadingHtml(): string {
    return `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); opacity: 0.7; padding: 16px;">Loading…</body></html>`;
  }

  private emptyHtml(): string {
    return `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); opacity: 0.7; padding: 16px;">Select a chapter in the Library view to start reading here.</body></html>`;
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

function rewriteImageSrcs(html: string, webview: vscode.Webview): string {
  return html.replace(/src="([^"]+)"/g, (full, src: string) => {
    if (!src.startsWith('file://')) {return full;}
    const converted = webview.asWebviewUri(vscode.Uri.parse(src));
    return `src="${converted.toString()}"`;
  });
}
