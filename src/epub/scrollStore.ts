import * as vscode from 'vscode';

const KEY = 'openReader.scroll';

type ScrollMap = Record<string, number>;

/**
 * Scroll position per chapter, stored as a 0..1 ratio of the scrollable height so it
 * survives font-size and margin changes. Keyed by book path + chapter index, so leaving
 * the view for the SCM or Explorer panel and coming back resumes where you were.
 */
export class ScrollStore {
  constructor(private context: vscode.ExtensionContext) {}

  private read(): ScrollMap {
    return this.context.globalState.get<ScrollMap>(KEY, {});
  }

  private static key(filePath: string, index: number): string {
    return `${filePath}::${index}`;
  }

  get(filePath: string, index: number): number {
    const ratio = this.read()[ScrollStore.key(filePath, index)] ?? 0;
    return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  }

  async set(filePath: string, index: number, ratio: number): Promise<void> {
    if (!Number.isFinite(ratio)) {
      return;
    }
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const all = this.read();
    const key = ScrollStore.key(filePath, index);
    if (Math.abs((all[key] ?? 0) - clamped) < 0.001) {
      return;
    }
    all[key] = clamped;
    await this.context.globalState.update(KEY, all);
  }
}
