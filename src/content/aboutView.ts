import * as vscode from 'vscode';

/** Mirrors the web app's src/lib/site.json — update both when a URL changes. */
const LINKS = {
  website: 'https://epub-web-reader.vercel.app/',
  library: 'https://epub-web-reader.vercel.app/library',
  philosophy: 'https://epub-web-reader.vercel.app/philosophy',
  github: 'https://github.com/x7dl8p',
  repo: 'https://github.com/x7dl8p/open-reader-vs',
  issues: 'https://github.com/x7dl8p/open-reader-vs/issues',
  releases: 'https://github.com/x7dl8p/open-reader-vs/releases',
};

const BRAND = '#F79518';
const BRAND_SOFT = '#F9BE71';

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
:root {
  --brand: ${BRAND};
  --brand-soft: ${BRAND_SOFT};
  --line: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
  --muted: color-mix(in srgb, var(--vscode-foreground) 62%, transparent);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 24px 64px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-foreground);
}
main { max-width: 620px; margin: 0 auto; }

.hero {
  position: relative;
  margin: 0 -24px 40px;
  padding: 56px 24px 40px;
  text-align: center;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute; inset: -60% 20% auto; height: 320px;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--brand) 26%, transparent), transparent);
  pointer-events: none;
}
.mark {
  position: relative;
  width: 84px; height: 84px; border-radius: 20px;
  box-shadow: 0 12px 32px -12px color-mix(in srgb, var(--brand) 70%, transparent);
}
h1 {
  position: relative;
  margin: 20px 0 0; font-size: 26px; font-weight: 650; letter-spacing: -0.02em;
}
.tagline { position: relative; margin: 10px auto 0; max-width: 40ch; color: var(--muted); }
.pill {
  position: relative; display: inline-block; margin-top: 18px;
  padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 600;
  letter-spacing: .04em; text-transform: uppercase;
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand) 34%, transparent);
}

.rule { display: flex; align-items: center; gap: 12px; margin: 0 0 20px; }
.rule span { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.rule::after { content: ''; flex: 1; height: 1px; background: var(--line); }

.traits { display: grid; gap: 22px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 44px; }
.trait svg { width: 20px; height: 20px; stroke: var(--brand); fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.trait h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; }
.trait p { margin: 0; color: var(--muted); font-size: 12px; }

.links { display: grid; gap: 10px; margin-bottom: 40px; }
.link {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 10px;
  border: 1px solid var(--line);
  color: inherit; text-decoration: none;
  transition: border-color .15s ease, background .15s ease;
}
.link:hover {
  border-color: color-mix(in srgb, var(--brand) 55%, transparent);
  background: color-mix(in srgb, var(--brand) 7%, transparent);
}
.link svg { width: 18px; height: 18px; flex: none; stroke: var(--brand-soft); fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.link .text { flex: 1; min-width: 0; }
.link .title { font-weight: 600; }
.link .sub { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.link .chev { stroke: var(--muted); width: 14px; height: 14px; }

.web { margin-bottom: 40px; }
.web-lead { margin: 0 0 18px; color: var(--muted); }
.web-lead a { color: var(--brand); text-decoration: none; }
.web-lead a:hover { text-decoration: underline; }
.web-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.web-list li { display: flex; align-items: baseline; gap: 12px; }
.web-list a { color: var(--vscode-foreground); text-decoration: none; font-weight: 600; white-space: nowrap; }
.web-list a:hover { color: var(--brand); }
.web-list span { color: var(--muted); font-size: 12px; }

.meta { display: flex; justify-content: space-between; gap: 16px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
  <main>
    <section class="hero">
      <img class="mark" src="${icon}" alt="">
      <h1>${escapeHtml(this.name)}</h1>
      <p class="tagline">A local-first reader for EPUB and CBZ comics, living inside your editor. Your library, your typography, nothing leaving your machine.</p>
      <div class="pill">Version ${escapeHtml(this.version)}</div>
    </section>

    <div class="rule"><span>Why it exists</span></div>
    <section class="traits">
      <div class="trait">
        <svg viewBox="0 0 24 24"><path d="M4 5.5c2.5-1.2 5.5-1.3 8 .3v12c-2.5-1.6-5.5-1.5-8-.3z"/><path d="M20 5.5c-2.5-1.2-5.5-1.3-8 .3v12c2.5-1.6 5.5-1.5 8-.3z"/></svg>
        <h3>Reads like a book</h3>
        <p>Styled prose in the sidebar or the editor area — never your code font.</p>
      </div>
      <div class="trait">
        <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        <h3>Stays on disk</h3>
        <p>Books are parsed locally. No account, no upload, no telemetry.</p>
      </div>
      <div class="trait">
        <svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M5 8h14"/><circle cx="9" cy="14" r="2.5"/></svg>
        <h3>Tuned to you</h3>
        <p>Typeface, rhythm, margins and themes, applied live as you change them.</p>
      </div>
    </section>

    <div class="rule"><span>On the web</span></div>
    <section class="web">
      <p class="web-lead">
        Open Reader also runs in the browser at <a href="${LINKS.website}">epub-web-reader.vercel.app</a> —
        the same library, the same typography controls and the same reading themes, with your books kept in
        the browser's own storage. Nothing syncs between the two: each keeps its own shelf, locally.
      </p>
      <ul class="web-list">
        <li><a href="${LINKS.library}">Your library</a><span>Add EPUB, CBZ, Markdown, HTML or plain text</span></li>
        <li><a href="${LINKS.philosophy}">Philosophy</a><span>Why it is built local-first</span></li>
        <li><a href="${LINKS.issues}">Issues</a><span>Report a bug or ask for a format</span></li>
      </ul>
    </section>

    <div class="rule"><span>Elsewhere</span></div>
    <section class="links">
      <a class="link" href="${LINKS.website}">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>
        <span class="text"><span class="title">Open Reader on the web</span><br><span class="sub">epub-web-reader.vercel.app</span></span>
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </a>
      <a class="link" href="${LINKS.github}">
        <svg viewBox="0 0 24 24"><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.6a5.1 5.1 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C6.8 1.4 5.7 1.7 5.7 1.7a4.8 4.8 0 0 0-.1 3.6A5.1 5.1 0 0 0 4.2 8.9c0 5.1 3.1 6.3 6.1 6.6a3.4 3.4 0 0 0-.9 2.6V22"/></svg>
        <span class="text"><span class="title">Built by x7dl8p</span><br><span class="sub">github.com/x7dl8p</span></span>
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </a>
      <a class="link" href="${LINKS.repo}">
        <svg viewBox="0 0 24 24"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>
        <span class="text"><span class="title">Source &amp; releases</span><br><span class="sub">github.com/x7dl8p/open-reader-vs</span></span>
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </a>
    </section>

    <footer class="meta">
      <span>EPUB &amp; CBZ · local-first · <a href="${LINKS.website}" style="color:var(--brand);text-decoration:none">on the web</a></span>
      <span>v${escapeHtml(this.version)}</span>
    </footer>
  </main>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
