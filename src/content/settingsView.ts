import * as vscode from 'vscode';
import { DEFAULT_READER_PREFS, loadReaderPrefs, updateReaderPref, type ReaderPrefs } from '../epub/readerPrefs';
import { renderSettingsHtml } from './settings/render';
import { debounce } from '../util/debounce';

type Message =
  | { type: 'set'; key: keyof ReaderPrefs; value: ReaderPrefs[keyof ReaderPrefs] }
  | { type: 'setColors'; bgColor: string; textColor: string }
  | { type: 'reset' };

const PERSIST_DELAY_MS = 200;

/** A reading surface that re-styles itself live while the settings panel is open. */
export interface PrefsTarget {
  applyPrefs(prefs: ReaderPrefs): void;
}

export class SettingsPanel {
  private panel?: vscode.WebviewPanel;
  private prefs: ReaderPrefs = loadReaderPrefs();
  private pending = new Map<keyof ReaderPrefs, ReaderPrefs[keyof ReaderPrefs]>();

  private flush = debounce(() => {
    const entries = [...this.pending];
    this.pending.clear();
    for (const [key, value] of entries) {
      void updateReaderPref(key, value);
    }
  }, PERSIST_DELAY_MS);

  constructor(private targets: PrefsTarget[]) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel('openReaderSettings', 'Reader Settings', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.onDidDispose(() => {
      this.flush.flush();
      this.panel = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg: Message) => this.handleMessage(msg));

    this.prefs = loadReaderPrefs();
    this.render();
  }

  private render(): void {
    if (this.panel) {
      this.panel.webview.html = renderSettingsHtml(this.prefs);
    }
  }

  private handleMessage(msg: Message): void {
    if (msg.type === 'set') {
      this.stage({ [msg.key]: msg.value } as Partial<ReaderPrefs>);
      return;
    }
    if (msg.type === 'setColors') {
      this.stage({ bgColor: msg.bgColor, textColor: msg.textColor });
      return;
    }
    this.resetAll();
  }

  private stage(patch: Partial<ReaderPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    for (const [key, value] of Object.entries(patch)) {
      this.pending.set(key as keyof ReaderPrefs, value as ReaderPrefs[keyof ReaderPrefs]);
    }
    this.broadcast();
    this.flush();
  }

  private broadcast(): void {
    for (const target of this.targets) {
      target.applyPrefs(this.prefs);
    }
  }

  private resetAll(): void {
    this.flush.cancel();
    this.pending.clear();
    this.prefs = { ...DEFAULT_READER_PREFS };
    this.broadcast();
    for (const key of Object.keys(DEFAULT_READER_PREFS) as Array<keyof ReaderPrefs>) {
      void updateReaderPref(key, DEFAULT_READER_PREFS[key]);
    }
    this.render();
  }
}
