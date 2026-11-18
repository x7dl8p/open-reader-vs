import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { OFFICIAL_REPOSITORY, type FilterValues, type SourceItem, type SourcePlugin } from './types';
import { evaluatePlugin } from './runtime/sandbox';
import { clearPluginStorage, KeyValueFile } from './runtime/storage';

const INSTALLED_KEY = 'openReader.installedSources';
const CATALOG_TTL_MS = 30 * 60 * 1000;

/**
 * Installs, loads and updates LNReader plugins ("sources"), mirroring the app's
 * pluginManager: the catalog is every enabled repository's plugins.min.json merged by
 * id, an install saves the plugin's JS under global storage, and loading evaluates it.
 */
export class SourceManager {
  private catalog?: { at: number; items: SourceItem[] };
  private loaded = new Map<string, SourcePlugin>();
  /** In-flight loads, so parallel downloads share one evaluation (or one reinstall). */
  private loading = new Map<string, Promise<SourcePlugin>>();
  private readonly store: KeyValueFile;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fires when the set of installed sources changes. */
  readonly onDidChange = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext, private storageDir: string) {
    this.store = new KeyValueFile(path.join(storageDir, 'plugin-db.json'));
  }

  repositories(): string[] {
    const configured = vscode.workspace.getConfiguration('openReader').get<string[]>('sourceRepositories');
    return configured && configured.length > 0 ? configured : [OFFICIAL_REPOSITORY];
  }

  installed(): SourceItem[] {
    return this.context.globalState.get<SourceItem[]>(INSTALLED_KEY, []);
  }

  isInstalled(id: string): boolean {
    return this.installed().some((item) => item.id === id);
  }

  /** Every source the enabled repositories offer. Later repositories win on duplicate ids. */
  async listAvailable(force = false): Promise<SourceItem[]> {
    if (!force && this.catalog && Date.now() - this.catalog.at < CATALOG_TTL_MS) {
      return this.catalog.items;
    }
    const byId = new Map<string, SourceItem>();
    const errors: string[] = [];
    for (const repo of this.repositories()) {
      try {
        const res = await fetch(repo, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const items = (await res.json()) as SourceItem[];
        for (const item of items) {
          byId.set(item.id, item);
        }
      } catch (err) {
        errors.push(`${repo}: ${errorMessage(err)}`);
      }
    }
    if (byId.size === 0 && errors.length > 0) {
      throw new Error(`Could not load any source repository.\n${errors.join('\n')}`);
    }
    const items = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    this.catalog = { at: Date.now(), items };
    return items;
  }

  async install(item: SourceItem): Promise<SourcePlugin> {
    const res = await fetch(item.url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(`Download failed (HTTP ${res.status})`);
    }
    const code = await res.text();
    // Evaluate before saving, so a plugin that cannot load is never recorded as installed.
    const plugin = evaluatePlugin(item.id, code, this.store);

    const dir = this.pluginDir(item.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.js'), code);

    const record: SourceItem = { ...item, version: plugin.version || item.version };
    const next = [...this.installed().filter((other) => other.id !== item.id), record];
    await this.context.globalState.update(INSTALLED_KEY, next);
    this.loaded.set(item.id, plugin);
    this._onDidChange.fire();
    return plugin;
  }

  async uninstall(id: string): Promise<void> {
    this.loaded.delete(id);
    await fs.rm(this.pluginDir(id), { recursive: true, force: true });
    clearPluginStorage(this.store, id);
    this.store.flush();
    await this.context.globalState.update(
      INSTALLED_KEY,
      this.installed().filter((item) => item.id !== id)
    );
    this._onDidChange.fire();
  }

  /** The plugin instance for an installed source, evaluated once per session. */
  async load(id: string): Promise<SourcePlugin> {
    const cached = this.loaded.get(id);
    if (cached) {
      return cached;
    }
    const pending = this.loading.get(id);
    if (pending) {
      return pending;
    }
    const promise = this.loadFromDisk(id).finally(() => this.loading.delete(id));
    this.loading.set(id, promise);
    return promise;
  }

  private async loadFromDisk(id: string): Promise<SourcePlugin> {
    let code: string;
    try {
      code = await fs.readFile(path.join(this.pluginDir(id), 'index.js'), 'utf8');
    } catch {
      // Recorded as installed but the file is gone, e.g. the extension was removed and
      // reinstalled, which clears its storage folder but not its saved state. Heal it
      // by downloading the plugin again instead of asking for a manual reinstall.
      const record = this.installed().find((item) => item.id === id);
      if (!record) {
        throw new Error(`Source "${id}" is not installed`);
      }
      const latest = (await this.listAvailable().catch(() => [])).find((item) => item.id === id);
      return this.install(latest ?? record);
    }
    const plugin = evaluatePlugin(id, code, this.store);
    this.loaded.set(id, plugin);
    return plugin;
  }

  /** Installed sources whose repository now lists a newer version. */
  async updatesAvailable(): Promise<SourceItem[]> {
    const available = new Map((await this.listAvailable()).map((item) => [item.id, item]));
    return this.installed()
      .map((item) => ({ item, latest: available.get(item.id) }))
      .filter(({ item, latest }) => latest && isNewer(latest.version, item.version))
      .map(({ latest }) => latest as SourceItem);
  }

  /** The default value of each of a plugin's filters, in the shape popularNovels expects. */
  static defaultFilters(plugin: SourcePlugin): FilterValues {
    const values: FilterValues = {};
    for (const [key, filter] of Object.entries(plugin.filters ?? {})) {
      values[key] = { type: filter.type, value: filter.value };
    }
    return values;
  }

  /** An absolute URL for a plugin path, the way the app resolves it. */
  static resolveUrl(plugin: SourcePlugin, novelOrChapterPath: string, isNovel: boolean): string {
    if (/^https?:\/\//i.test(novelOrChapterPath)) {
      return novelOrChapterPath;
    }
    try {
      if (plugin.resolveUrl) {
        return plugin.resolveUrl(novelOrChapterPath, isNovel);
      }
    } catch {
      // Fall through to the site-relative default.
    }
    return new URL(novelOrChapterPath, plugin.site).toString();
  }

  flush(): void {
    this.store.flush();
  }

  private pluginDir(id: string): string {
    return path.join(this.storageDir, 'plugins', id.replace(/[^\w.-]/g, '_'));
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
}
