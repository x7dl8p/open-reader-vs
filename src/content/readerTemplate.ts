import * as vscode from 'vscode';
import type { BookMeta, ExtractedChapter } from '../epub/types';
import type { ReaderPrefs } from '../epub/readerPrefs';
import { cssVarsToDeclarations, prefsToCssVars } from './readerTheme';

const PLACEHOLDER = 'font-family: var(--vscode-font-family); opacity: 0.7; padding: 16px;';

export function renderChapterHtml(
  webview: vscode.Webview,
  meta: BookMeta,
  chapter: ExtractedChapter,
  index: number,
  prefs: ReaderPrefs,
  initialScroll = 0
): string {
  const vars = cssVarsToDeclarations(prefsToCssVars(prefs));
  const body = rewriteImageSrcs(chapter.html, webview);
  const atStart = index === 0;
  const atEnd = index === meta.totalChapters - 1;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
:root { color-scheme: light dark; ${vars} }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--reader-bg);
  color: var(--reader-fg);
  font-family: var(--reader-font);
  font-size: var(--reader-size);
  font-weight: var(--reader-weight);
  line-height: var(--reader-leading);
  letter-spacing: var(--reader-tracking);
  text-align: var(--reader-align);
  padding: var(--reader-margin-y) var(--reader-margin-x);
}
#content { column-width: var(--reader-columns); column-gap: 2.5rem; }
p { text-indent: var(--reader-indent); margin: var(--reader-para-margin); }
h1, h2, h3 { font-family: inherit; font-weight: 600; line-height: 1.3; text-indent: 0; }
img { max-width: 100%; height: auto; border-radius: 4px; }
.nav {
  display: flex; align-items: center; gap: 10px;
  margin-top: 2.5rem; padding-top: 12px;
  border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
  font-family: var(--vscode-font-family); font-size: 11px;
  letter-spacing: 0; text-indent: 0; text-align: left;
}
.nav .position { flex: 1; text-align: center; opacity: .7; display: var(--reader-position-display); }
.nav button {
  background: none; color: var(--vscode-foreground); cursor: pointer;
  border: 1px solid var(--vscode-button-border, rgba(128,128,128,.4));
  border-radius: 4px; padding: 4px 10px;
  font-family: var(--vscode-font-family); font-size: 11px;
}
.nav button:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
.nav button:disabled { opacity: .4; cursor: default; }
</style>
</head>
<body>
  <div id="content">
    <h1>${escapeHtml(chapter.title)}</h1>
    ${body}
  </div>
  <div class="nav">
    <button id="prev" ${atStart ? 'disabled' : ''}>&larr; Prev</button>
    <span class="position">${escapeHtml(meta.title)} — ${index + 1}/${meta.totalChapters}</span>
    <button id="next" ${atEnd ? 'disabled' : ''}>Next &rarr;</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('prev').addEventListener('click', () => vscode.postMessage({ type: 'prev' }));
    document.getElementById('next').addEventListener('click', () => vscode.postMessage({ type: 'next' }));
    window.addEventListener('message', (event) => {
      if (event.data.type !== 'prefs') { return; }
      const vars = event.data.vars;
      for (const name in vars) { document.documentElement.style.setProperty(name, vars[name]); }
    });

    // Resume where the reader left off. The webview is torn down whenever the view is
    // hidden, so the position is reported to the extension and handed back on render.
    const initialRatio = ${initialScroll.toFixed(6)};
    let touched = false;
    for (const type of ['wheel', 'keydown', 'touchmove', 'mousedown']) {
      window.addEventListener(type, () => { touched = true; }, { passive: true });
    }

    const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    // A chapter with no saved position starts at the top: the webview keeps its old
    // offset across a re-render, so stepping to the next chapter would otherwise land
    // at the bottom of it.
    const restore = () => window.scrollTo(0, initialRatio > 0 ? initialRatio * maxScroll() : 0);

    restore();
    // The host restores its own remembered offset after this script first runs, and
    // images settle later still — so hold the position briefly rather than placing it
    // once, until the reader takes over by scrolling.
    let settleUntil = Date.now() + 400;
    const hold = () => {
      if (touched || Date.now() > settleUntil) { return; }
      restore();
      requestAnimationFrame(hold);
    };
    requestAnimationFrame(hold);
    window.addEventListener('load', () => {
      if (touched) { return; }
      settleUntil = Date.now() + 400;
      requestAnimationFrame(hold);
    });

    let reportTimer;
    window.addEventListener('scroll', () => {
      clearTimeout(reportTimer);
      reportTimer = setTimeout(() => {
        vscode.postMessage({ type: 'scroll', ratio: window.scrollY / maxScroll() });
      }, 150);
    }, { passive: true });
  </script>
</body>
</html>`;
}

export function renderLoadingHtml(): string {
  return `<!DOCTYPE html><html><body style="${PLACEHOLDER}">Loading…</body></html>`;
}

export function renderEmptyHtml(): string {
  return `<!DOCTYPE html><html><body style="${PLACEHOLDER}">Select a chapter in the Library view to start reading here.</body></html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

function rewriteImageSrcs(html: string, webview: vscode.Webview): string {
  return html.replace(/src="([^"]+)"/g, (full, src: string) => {
    if (!src.startsWith('file://')) {
      return full;
    }
    return `src="${webview.asWebviewUri(vscode.Uri.parse(src)).toString()}"`;
  });
}
