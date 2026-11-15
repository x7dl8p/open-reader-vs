import * as vscode from 'vscode';
import {
  DEFAULT_READER_PREFS,
  loadReaderPrefs,
  updateReaderPrefs,
  type ReaderPrefs,
  type ReaderSurface,
} from '../epub/readerPrefs';
import { renderSettingsHtml } from './settings/render';
import { debounce } from '../util/debounce';

type Message =
  | { type: 'set'; surface: ReaderSurface; patch: Partial<ReaderPrefs> }
  | { type: 'reset'; surface: ReaderSurface }
  | { type: 'tab'; surface: ReaderSurface };

const PERSIST_DELAY_MS = 200;
const SURFACES: ReaderSurface[] = ['main', 'side'];

/** A reading surface that re-styles itself live while the settings panel is open. */
export interface PrefsTarget {
  applyPrefs(prefs: ReaderPrefs): void;
}

/**
 * One settings page with a tab per reading surface. Each tab edits its own prefs and
 * streams them to its own reader, so the editor reader and the sidebar can differ.
 */
export class SettingsPanel {
  private panel?: vscode.WebviewPanel;
  private prefs: Record<ReaderSurface, ReaderPrefs> = { main: loadReaderPrefs('main'), side: loadReaderPrefs('side') };
  private pending: Record<ReaderSurface, Partial<ReaderPrefs>> = { main: {}, side: {} };
  private activeTab: ReaderSurface = 'main';

  private flush = debounce(() => {
    for (const surface of SURFACES) {
      const patch = this.pending[surface];
      this.pending[surface] = {};
      if (Object.keys(patch).length > 0) {
        void updateReaderPrefs(surface, patch);
      }
    }
  }, PERSIST_DELAY_MS);

  constructor(private targets: Record<ReaderSurface, PrefsTarget>) {}

  open(tab?: ReaderSurface): void {
    if (tab) {
      this.activeTab = tab;
    }
    if (this.panel) {
      this.panel.reveal();
      if (tab) {
        void this.panel.webview.postMessage({ type: 'tab', surface: tab });
      }
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

    this.prefs = { main: loadReaderPrefs('main'), side: loadReaderPrefs('side') };
    this.render();
  }

  private render(): void {
    if (this.panel) {
      this.panel.webview.html = renderSettingsHtml(this.prefs, this.activeTab);
    }
  }

  private handleMessage(msg: Message): void {
    if (msg.type === 'tab') {
      this.activeTab = msg.surface;
      return;
    }
    if (msg.type === 'set') {
      this.stage(msg.surface, msg.patch);
      return;
    }
    this.reset(msg.surface);
  }

  private stage(surface: ReaderSurface, patch: Partial<ReaderPrefs>): void {
    this.prefs[surface] = { ...this.prefs[surface], ...patch };
    this.pending[surface] = { ...this.pending[surface], ...patch };
    this.targets[surface].applyPrefs(this.prefs[surface]);
    this.flush();
  }

  private reset(surface: ReaderSurface): void {
    this.flush.flush();
    this.prefs[surface] = { ...DEFAULT_READER_PREFS };
    this.targets[surface].applyPrefs(this.prefs[surface]);
    void updateReaderPrefs(surface, DEFAULT_READER_PREFS);
    this.activeTab = surface;
    this.render();
  }
}
