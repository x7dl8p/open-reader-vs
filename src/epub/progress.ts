import * as vscode from 'vscode';

const KEY = 'bookReader.progress';

type ProgressMap = Record<string, number>;

/** Last-read chapter index per book, keyed by absolute file path. */
export class ProgressStore {
  constructor(private context: vscode.ExtensionContext) {}

  private read(): ProgressMap {
    return this.context.globalState.get<ProgressMap>(KEY, {});
  }

  get(filePath: string): number {
    return this.read()[filePath] ?? 0;
  }

  async set(filePath: string, chapterIndex: number): Promise<void> {
    const all = this.read();
    if (all[filePath] === chapterIndex) {return;}
    all[filePath] = chapterIndex;
    await this.context.globalState.update(KEY, all);
  }
}
