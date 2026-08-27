import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import type { ProgressStore } from '../epub/progress';
import { renderChapterHtml, renderEmptyHtml, renderLoadingHtml } from './nowReadingTemplate';

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
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.imagesRoot] };
    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => this.handleMessage(msg));

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
      // Not resolved yet (collapsed/never opened) — focusing triggers resolveWebviewView,
      // which will pick up `this.current` and render on its own.
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

    this.view.webview.html = renderChapterHtml(this.view.webview, meta, chapter, index);
  }
}
