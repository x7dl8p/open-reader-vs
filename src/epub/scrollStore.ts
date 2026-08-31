import * as vscode from 'vscode';

const KEY = 'openReader.scroll';
/** Scroll events arrive continuously; writes are coalesced onto this interval. */
const WRITE_DELAY_MS = 800;
/** Ceiling on stored positions, so a long-lived install cannot grow the synced blob. */
const MAX_ENTRIES = 800;

type ScrollMap = Record<string, number>;

/**
 * Scroll position per chapter, stored as a 0..1 ratio of the scrollable height so it
 * survives font-size and margin changes. Keyed by book path + chapter index, so leaving
 * the view for the SCM or Explorer panel and coming back resumes where you were.
 *
 * Writes are debounced and skipped when the position has not meaningfully moved, so an
 * idle reader performs no writes at all.
 */
export class ScrollStore {
  private pending = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  private read(): ScrollMap {
    return this.context.globalState.get<ScrollMap>(KEY, {});
  }

  private static key(filePath: string, index: number): string {
    return `${filePath}::${index}`;
  }

  get(filePath: string, index: number): number {
    const key = ScrollStore.key(filePath, index);
    const ratio = this.pending.get(key) ?? this.read()[key] ?? 0;
    return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  }

  set(filePath: string, index: number, ratio: number): void {
    if (!Number.isFinite(ratio)) {
      return;
    }
    const key = ScrollStore.key(filePath, index);
    const clamped = Math.min(Math.max(ratio, 0), 1);

    // Nothing new to save means no write and, crucially, no timer — an open but idle
    // book must not tick every 800ms forever.
    if (Math.abs(this.get(filePath, index) - clamped) < 0.001) {
      return;
    }

    this.pending.set(key, clamped);
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, WRITE_DELAY_MS);
    }
  }

  /** Write everything buffered. Called on a timer, and once more on deactivate. */
  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.size === 0) {
      return;
    }

    const all = { ...this.read() };
    for (const [key, ratio] of this.pending) {
      // Re-inserting moves the key to the end, which is what keeps eviction recency-ordered.
      delete all[key];
      all[key] = ratio;
    }
    this.pending.clear();

    const keys = Object.keys(all);
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      delete all[stale];
    }

    await this.context.globalState.update(KEY, all);
  }
}
