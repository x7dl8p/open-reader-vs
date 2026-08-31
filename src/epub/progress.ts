import * as vscode from 'vscode';

const KEY = 'openReader.progress';
const LAST_READ_KEY = 'openReader.lastRead';

type ProgressMap = Record<string, number>;

/** The book and chapter open when the window was last used. */
export interface LastRead {
  filePath: string;
  chapterIndex: number;
}

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
    await this.setLastRead(filePath, chapterIndex);

    const all = this.read();
    if (all[filePath] === chapterIndex) {return;}
    all[filePath] = chapterIndex;
    await this.context.globalState.update(KEY, all);
  }

  getLastRead(): LastRead | undefined {
    return this.context.globalState.get<LastRead>(LAST_READ_KEY);
  }

  private async setLastRead(filePath: string, chapterIndex: number): Promise<void> {
    const current = this.getLastRead();
    if (current?.filePath === filePath && current.chapterIndex === chapterIndex) {return;}
    await this.context.globalState.update(LAST_READ_KEY, { filePath, chapterIndex });
  }
}
