import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import type { ScrollStore } from '../epub/scrollStore';
import { loadReaderPrefs, type ReaderPrefs } from '../epub/readerPrefs';
import { prefsToCssVars } from './readerTheme';
import { renderChapterHtml, renderEmptyHtml, renderLoadingHtml } from './readerTemplate';

type WebviewMessage = { type: 'prev' | 'next' } | { type: 'scroll'; ratio: number };

export class NowReadingViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'openReaderNowReading';

  private view?: vscode.WebviewView;
  private current?: { filePath: string; index: number };
  private prefs: ReaderPrefs = loadReaderPrefs();

  constructor(
    private library: Library,
    private progress: ProgressStore,
    private scroll: ScrollStore,
    private imagesRoot: vscode.Uri,
    private onDidRead: (filePath: string, index: number) => void
  ) {}

  /**
   * Point the view at a book without opening or focusing anything — used to restore the
   * last session. Renders straight away if the view is already up; otherwise the chapter
   * appears when the user opens the view themselves.
   */
  restore(filePath: string, index: number): void {
    this.current = { filePath, index };
    if (this.view) {
      void this.render(filePath, index);
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.imagesRoot] };
    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg));

    if (this.current) {
      webviewView.webview.html = renderLoadingHtml();
      void this.render(this.current.filePath, this.current.index);
    } else {
      webviewView.webview.html = renderEmptyHtml();
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

  applyPrefs(prefs: ReaderPrefs): void {
    this.prefs = prefs;
    void this.view?.webview.postMessage({ type: 'prefs', vars: prefsToCssVars(prefs) });
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'prev') {
      await this.step(-1);
    }
    if (msg.type === 'next') {
      await this.step(1);
    }
    if (msg.type === 'scroll' && this.current) {
      this.scroll.set(this.current.filePath, this.current.index, msg.ratio);
    }
  }

  private async step(delta: number): Promise<void> {
    if (!this.current) {
      return;
    }
    const meta = await this.library.getMeta(this.current.filePath);
    const nextIndex = Math.max(0, Math.min(this.current.index + delta, meta.totalChapters - 1));
    await this.show(this.current.filePath, nextIndex);
  }

  private async render(filePath: string, index: number): Promise<void> {
    if (!this.view) {
      return;
    }

    let meta;
    let chapter;
    try {
      [meta, chapter] = await Promise.all([this.library.getMeta(filePath), this.library.getChapter(filePath, index)]);
    } catch {
      // The restored book has been moved or deleted since it was last read.
      this.current = undefined;
      this.view.webview.html = renderEmptyHtml();
      return;
    }

    await this.progress.set(filePath, index);
    // Without this the "reading" marker in the Library tree stays on the previous chapter.
    this.onDidRead(filePath, index);
    this.view.webview.html = renderChapterHtml(
      this.view.webview,
      meta,
      chapter,
      index,
      this.prefs,
      this.scroll.get(filePath, index)
    );
  }
}
