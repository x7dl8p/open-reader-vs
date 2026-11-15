import * as fs from 'fs';
import * as path from 'path';

/**
 * Node port of LNReader's @libs/storage (lnreader/src/plugins/helpers/storage.ts).
 * Plugins call it synchronously, so the store lives in memory and is written to one
 * JSON file shortly after each change. Keys keep the app's `<pluginId>_DB_<key>` scheme.
 */
export class KeyValueFile {
  private data: Record<string, string> = {};
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private filePath: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
    } catch {
      this.data = {};
    }
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set(key: string, value: string): void {
    this.data[key] = value;
    this.scheduleWrite();
  }

  remove(key: string): void {
    delete this.data[key];
    this.scheduleWrite();
  }

  keys(): string[] {
    return Object.keys(this.data);
  }

  private scheduleWrite(): void {
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data));
  }
}

const PLUGIN_STORAGE = '_DB_';
const WEBVIEW_LOCAL_STORAGE = '_LocalStorage';
const WEBVIEW_SESSION_STORAGE = '_SessionStorage';

interface StoredItem {
  created: Date;
  value: unknown;
  expires?: number;
}

export class PluginStorage {
  constructor(private store: KeyValueFile, private pluginId: string) {}

  private key(key: string): string {
    return this.pluginId + PLUGIN_STORAGE + key;
  }

  set(key: string, value: unknown, expires?: Date | number): void {
    const item: StoredItem = {
      created: new Date(),
      value,
      expires: expires instanceof Date ? expires.getTime() : expires,
    };
    this.store.set(this.key(key), JSON.stringify(item));
  }

  get(key: string, raw?: boolean): unknown {
    const stored = this.store.get(this.key(key));
    if (!stored) {
      return undefined;
    }
    const item = JSON.parse(stored) as StoredItem;
    if (item.expires && Date.now() > item.expires) {
      this.delete(key);
      return undefined;
    }
    return raw ? item : item.value;
  }

  delete(key: string): void {
    this.store.remove(this.key(key));
  }

  clearAll(): void {
    this.getAllKeys().forEach((key) => this.delete(key));
  }

  getAllKeys(): string[] {
    const prefix = this.pluginId + PLUGIN_STORAGE;
    return this.store
      .keys()
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
}

/**
 * The app fills these from the site's own localStorage/sessionStorage through a WebView.
 * There is no such capture here yet, so they read whatever was stored (usually nothing).
 */
export class PluginWebStorage {
  constructor(private store: KeyValueFile, private pluginId: string, private kind: 'local' | 'session') {}

  get(): unknown {
    const suffix = this.kind === 'local' ? WEBVIEW_LOCAL_STORAGE : WEBVIEW_SESSION_STORAGE;
    const data = this.store.get(this.pluginId + suffix);
    return data ? JSON.parse(data) : undefined;
  }
}

/** Remove everything a plugin stored, done on uninstall, as the app does. */
export function clearPluginStorage(store: KeyValueFile, pluginId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(pluginId + '_')) {
      store.remove(key);
    }
  }
}
