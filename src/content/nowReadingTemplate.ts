import * as vscode from 'vscode';
import type { BookMeta, ExtractedChapter } from '../epub/types';

const PLACEHOLDER_STYLE = 'font-family: var(--vscode-font-family); opacity: 0.7; padding: 16px;';

export function renderChapterHtml(webview: vscode.Webview, meta: BookMeta, chapter: ExtractedChapter, index: number): string {
  const body = rewriteImageSrcs(chapter.html, webview);

  return page(
    webview,
    `
    <style>${chapterStyles()}</style>
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
    </script>`
  );
}

export function renderLoadingHtml(): string {
  return `<!DOCTYPE html><html><body style="${PLACEHOLDER_STYLE}">Loading…</body></html>`;
}

export function renderEmptyHtml(): string {
  return `<!DOCTYPE html><html><body style="${PLACEHOLDER_STYLE}">Select a chapter in the Library view to start reading here.</body></html>`;
}

function page(webview: vscode.Webview, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
</head>
<body>${body}</body>
</html>`;
}

function chapterStyles(): string {
  return `
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
  button:disabled { opacity: 0.4; cursor: default; }`;
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
