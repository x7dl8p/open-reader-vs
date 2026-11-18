import * as vscode from 'vscode';
import type { NovelStore } from './novelStore';
import { errorMessage } from './sourceManager';

/** Bounds of openReader.downloadConcurrency; keep in step with package.json. */
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 12;
const CONCURRENCY_DEFAULT = 3;

/** Parallel chapter downloads per job, read when a job starts. */
function concurrency(): number {
  const value = vscode.workspace.getConfiguration('openReader').get<number>('downloadConcurrency', CONCURRENCY_DEFAULT);
  return Math.min(CONCURRENCY_MAX, Math.max(CONCURRENCY_MIN, Math.round(Number(value) || CONCURRENCY_DEFAULT)));
}

export interface DownloadStatus {
  filePath: string;
  total: number;
  done: number;
  failed: number;
  running: boolean;
  lastError?: string;
}

interface Job extends DownloadStatus {
  queue: number[];
  cancelled: boolean;
  /** Settles once every in-flight chapter has finished. */
  finished?: Promise<void>;
}

/**
 * Chapter downloads, one job per novel, several chapters in parallel. Adding chapters to
 * a running job extends it.
 * Progress is published through {@link onDidChange} for the Browse page and the tree.
 */
export class DownloadQueue {
  private jobs = new Map<string, Job>();
  private readonly _onDidChange = new vscode.EventEmitter<DownloadStatus>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private novels: NovelStore) {}

  status(filePath: string): DownloadStatus | undefined {
    const job = this.jobs.get(filePath);
    return job ? snapshot(job) : undefined;
  }

  enqueue(filePath: string, indexes: number[]): void {
    let job = this.jobs.get(filePath);
    if (!job || !job.running) {
      job = { filePath, total: 0, done: 0, failed: 0, running: true, queue: [], cancelled: false };
      this.jobs.set(filePath, job);
      job.finished = this.run(job);
    }
    const queued = new Set(job.queue);
    const fresh = indexes.filter((i) => !queued.has(i));
    job.queue.push(...fresh);
    job.total += fresh.length;
    this._onDidChange.fire(snapshot(job));
  }

  /** Stop a job. The promise settles when chapters already downloading have finished. */
  cancel(filePath: string): Promise<void> {
    const job = this.jobs.get(filePath);
    if (job?.running) {
      job.cancelled = true;
      job.queue = [];
    }
    return job?.finished ?? Promise.resolve();
  }

  cancelAll(): void {
    for (const filePath of this.jobs.keys()) {
      void this.cancel(filePath);
    }
  }

  /** Every job still downloading. */
  running(): DownloadStatus[] {
    return [...this.jobs.values()].filter((job) => job.running).map(snapshot);
  }

  private async run(job: Job): Promise<void> {
    // Let enqueue() fill the queue before the workers look at it.
    await Promise.resolve();
    const worker = async () => {
      while (!job.cancelled) {
        const index = job.queue.shift();
        if (index === undefined) {
          return;
        }
        try {
          await this.novels.downloadChapter(job.filePath, index);
        } catch (err) {
          job.failed++;
          job.lastError = errorMessage(err);
        }
        job.done++;
        this._onDidChange.fire(snapshot(job));
      }
    };
    await Promise.all(Array.from({ length: concurrency() }, worker));
    job.running = false;
    this._onDidChange.fire(snapshot(job));
  }
}

function snapshot(job: Job): DownloadStatus {
  const { filePath, total, done, failed, running, lastError } = job;
  return { filePath, total, done, failed, running, lastError };
}
