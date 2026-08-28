import * as vscode from 'vscode';

const GITHUB_URL = 'https://github.com/x7dl8p';
const WEB_READER_URL = 'https://epub-web-reader.vercel.app/';

/** The About page, reachable from the Library view's overflow menu. */
export class AboutPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private extensionUri: vscode.Uri, private name: string, private version: string) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel('openReaderAbout', `About ${this.name}`, vscode.ViewColumn.Active, {
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'resources')],
    });
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.png');
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel.webview.html = this.render(this.panel.webview);
  }

  private render(webview: vscode.Webview): string {
    const icon = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.png'));

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 40px 24px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
}
main { max-width: 480px; margin: 0 auto; }
header { display: flex; align-items: center; gap: 16px; }
header img { width: 56px; height: 56px; border-radius: 10px; }
h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.version {
  display: inline-block; margin-top: 6px; padding: 1px 8px;
  border: 1px solid var(--vscode-badge-background, rgba(128,128,128,.4));
  border-radius: 10px; font-size: 11px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
}
.tagline { margin: 20px 0 28px; line-height: 1.6; opacity: .85; }
.card {
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25));
  background: var(--vscode-editorWidget-background);
  border-radius: 8px; overflow: hidden;
}
.row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  padding: 12px 16px;
}
.row + .row { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2)); }
.label { opacity: .7; white-space: nowrap; }
.value { text-align: right; overflow-wrap: anywhere; }
a { color: var(--vscode-textLink-foreground); text-decoration: none; }
a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
footer { margin-top: 28px; font-size: 11px; opacity: .55; text-align: center; }
</style>
</head>
<body>
  <main>
    <header>
      <img src="${icon}" alt="">
      <div>
        <h1>${escapeHtml(this.name)}</h1>
        <span class="version">v${escapeHtml(this.version)}</span>
      </div>
    </header>

    <p class="tagline">A native e-book reader for VS Code. Read EPUB and CBZ files in the sidebar or the editor area, styled the way you like.</p>

    <div class="card">
      <div class="row"><span class="label">Version</span><span class="value">${escapeHtml(this.version)}</span></div>
      <div class="row"><span class="label">Developer</span><span class="value"><a href="${GITHUB_URL}">github.com/x7dl8p</a></span></div>
      <div class="row"><span class="label">Web reader</span><span class="value"><a href="${WEB_READER_URL}">epub-web-reader.vercel.app</a></span></div>
    </div>

    <footer>Same reader, in the browser and in your editor.</footer>
  </main>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
