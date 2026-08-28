import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { ScrollStore } from '../epub/scrollStore';
import { loadReaderPrefs, type ReaderPrefs } from '../epub/readerPrefs';
import { prefsToCssVars } from './readerTheme';
import { renderChapterHtml, renderLoadingHtml } from './readerTemplate';

type WebviewMessage = { type: 'prev' | 'next' } | { type: 'scroll'; ratio: number };

/**
 * The editor-area reader. Chapters render in a webview panel so the main reading
 * surface honours the same openReader.* prefs as the Now Reading side panel — a
 * plain text document could only follow the editor's own font settings, not the
 * margins, colours, alignment or column layout.
 */
export class ReaderPanel {
  static readonly viewType = 'openReaderReader';

  private panel?: vscode.WebviewPanel;
  private current?: { filePath: string; index: number };
  private prefs: ReaderPrefs = loadReaderPrefs();

  constructor(
    private library: Library,
    private progress: ProgressStore,
    private scroll: ScrollStore,
    private imagesRoot: vscode.Uri,
    private iconPath: vscode.Uri,
    private onDidRead: () => void
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  async show(filePath: string, index: number): Promise<void> {
    const meta = await this.library.getMeta(filePath);
    const clampedIndex = Math.max(0, Math.min(index, meta.totalChapters - 1));
    this.current = { filePath, index: clampedIndex };

    const panel = this.ensurePanel();
    panel.reveal(panel.viewColumn, false);
    await this.render();
  }

  applyPrefs(prefs: ReaderPrefs): void {
    this.prefs = prefs;
    void this.panel?.webview.postMessage({ type: 'prefs', vars: prefsToCssVars(prefs) });
  }

  async step(delta: number): Promise<void> {
    if (!this.current) {
      return;
    }
    await this.show(this.current.filePath, this.current.index + delta);
  }

  async backToToc(): Promise<void> {
    if (!this.current) {
      return;
    }
    await vscode.commands.executeCommand('openReader.openToc', this.current.filePath);
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = vscode.window.createWebviewPanel(ReaderPanel.viewType, 'Reader', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.imagesRoot],
    });
    panel.iconPath = this.iconPath;
    panel.webview.html = renderLoadingHtml();
    panel.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.current = undefined;
    });

    this.panel = panel;
    return panel;
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'prev') {
      await this.step(-1);
    }
    if (msg.type === 'next') {
      await this.step(1);
    }
    if (msg.type === 'scroll' && this.current) {
      await this.scroll.set(this.current.filePath, this.current.index, msg.ratio);
    }
  }

  private async render(): Promise<void> {
    if (!this.panel || !this.current) {
      return;
    }
    const { filePath, index } = this.current;
    const [meta, chapter] = await Promise.all([this.library.getMeta(filePath), this.library.getChapter(filePath, index)]);

    this.panel.title = chapter.title || meta.title;
    this.panel.webview.html = renderChapterHtml(
      this.panel.webview,
      meta,
      chapter,
      index,
      this.prefs,
      this.scroll.get(filePath, index)
    );

    await this.progress.set(filePath, index);
    this.onDidRead();
  }
}
