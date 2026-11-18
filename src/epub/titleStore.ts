import * as vscode from 'vscode';

const KEY = 'openReader.titles';

/** Names the user gave books with Rename, by book path. The files themselves are untouched. */
export class TitleStore {
  private readonly _onDidChange = new vscode.EventEmitter<string>();
  /** Fires with the book's path when its name changes. */
  readonly onDidChange = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext) {}

  private all(): Record<string, string> {
    return this.context.globalState.get<Record<string, string>>(KEY, {});
  }

  get(filePath: string): string | undefined {
    return this.all()[filePath];
  }

  /** An empty name removes the override, so the book shows its own title again. */
  async set(filePath: string, title: string | undefined): Promise<void> {
    const all = { ...this.all() };
    if (title && title.trim()) {
      all[filePath] = title.trim();
    } else {
      delete all[filePath];
    }
    await this.context.globalState.update(KEY, all);
    this._onDidChange.fire(filePath);
  }
}
