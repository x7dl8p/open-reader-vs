import * as vscode from 'vscode';

const KEY = 'openReader.chapterState';
/** A chapter scrolled this far counts as read. */
export const FINISHED_RATIO = 0.97;

type Stored = Record<string, { r?: number[]; b?: number[] }>;

export interface ChapterState {
  read: Set<number>;
  bookmarks: Set<number>;
}

/**
 * Which chapters of each book are read or bookmarked, by chapter index, the same index
 * progress and scroll position use. Works for local books and online novels alike; an
 * online novel whose chapter list changes is re-keyed with {@link remap}.
 */
export class ReadStore {
  private readonly _onDidChange = new vscode.EventEmitter<string>();
  /** Fires with the book's path whenever its chapter state changes. */
  readonly onDidChange = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext) {}

  private all(): Stored {
    return this.context.globalState.get<Stored>(KEY, {});
  }

  get(filePath: string): ChapterState {
    const entry = this.all()[filePath] ?? {};
    return { read: new Set(entry.r ?? []), bookmarks: new Set(entry.b ?? []) };
  }

  isRead(filePath: string, index: number): boolean {
    return this.get(filePath).read.has(index);
  }

  async setRead(filePath: string, indexes: number[], read: boolean): Promise<void> {
    await this.update(filePath, (state) => indexes.forEach((i) => (read ? state.read.add(i) : state.read.delete(i))));
  }

  /** Everything before `index` becomes read, the app's "mark previous as read". */
  async markPreviousRead(filePath: string, index: number): Promise<void> {
    await this.update(filePath, (state) => {
      for (let i = 0; i < index; i++) {
        state.read.add(i);
      }
    });
  }

  async setBookmarked(filePath: string, indexes: number[], on: boolean): Promise<void> {
    await this.update(filePath, (state) => indexes.forEach((i) => (on ? state.bookmarks.add(i) : state.bookmarks.delete(i))));
  }

  /**
   * Carry state across a chapter-list refresh: a chapter keeps its read/bookmark marks
   * by its key (an online chapter's path) wherever it now sits in the list.
   */
  async remap(filePath: string, oldKeys: string[], newKeys: string[]): Promise<void> {
    if (oldKeys.length === newKeys.length && oldKeys.every((key, i) => key === newKeys[i])) {
      return;
    }
    const position = new Map(newKeys.map((key, i) => [key, i]));
    const move = (set: Set<number>) =>
      new Set([...set].map((i) => position.get(oldKeys[i] ?? '')).filter((i): i is number => i !== undefined));
    await this.update(filePath, (state) => {
      const read = move(state.read);
      const bookmarks = move(state.bookmarks);
      state.read.clear();
      state.bookmarks.clear();
      read.forEach((i) => state.read.add(i));
      bookmarks.forEach((i) => state.bookmarks.add(i));
    });
  }

  async forget(filePath: string): Promise<void> {
    const all = { ...this.all() };
    delete all[filePath];
    await this.context.globalState.update(KEY, all);
    this._onDidChange.fire(filePath);
  }

  private async update(filePath: string, change: (state: ChapterState) => void): Promise<void> {
    const state = this.get(filePath);
    change(state);
    const all = { ...this.all() };
    const r = [...state.read].sort((a, b) => a - b);
    const b = [...state.bookmarks].sort((x, y) => x - y);
    if (r.length === 0 && b.length === 0) {
      delete all[filePath];
    } else {
      all[filePath] = { ...(r.length ? { r } : {}), ...(b.length ? { b } : {}) };
    }
    await this.context.globalState.update(KEY, all);
    this._onDidChange.fire(filePath);
  }
}
