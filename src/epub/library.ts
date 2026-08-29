import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type JSZip from 'jszip';
import type { BookMeta, ExtractedChapter } from './types';
import { allExtensions, formatForPath, type BookFormat } from './formats';

export interface LibraryBook {
  filePath: string;
  fileName: string;
  meta: BookMeta;
}

interface CacheEntry {
  mtimeMs: number;
  meta: BookMeta;
  zip: JSZip;
  format: BookFormat;
}

/**
 * Scans the configured library folders for supported book files (see formats.ts) and
 * parses them on demand. Parsed archives are kept in memory keyed by file path + mtime,
 * so re-opening the same book (or re-expanding the tree) doesn't re-unzip it.
 */
export class Library {
  private cache = new Map<string, CacheEntry>();

  constructor(private imageStorageDir: string) {}

  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  private configuredFolders(): string[] {
    return vscode.workspace.getConfiguration('openReader').get<string[]>('libraryFolders') ?? [];
  }

  /**
   * The book list always follows the open workspace, so adding a library folder never
   * moves the library off the project you are working in. Configured folders are only
   * the fallback when no workspace is open.
   */
  getBookFolders(): string[] {
    const workspace = this.workspaceFolders();
    return workspace.length > 0 ? workspace : this.configuredFolders();
  }

  /** The eye/file view browses the folder you added, falling back to the workspace. */
  getBrowseFolders(): string[] {
    const configured = this.configuredFolders();
    return configured.length > 0 ? configured : this.workspaceFolders();
  }

  async listBooks(): Promise<LibraryBook[]> {
    const folders = this.getBookFolders();
    const found: LibraryBook[] = [];

    for (const folder of folders) {
      const files = await findBookFiles(folder);
      for (const filePath of files) {
        try {
          const entry = await this.loadEntry(filePath);
          found.push({ filePath, fileName: path.basename(filePath), meta: entry.meta });
        } catch (err) {
          console.error(`[open-reader] Failed to parse ${filePath}:`, err);
        }
      }
    }

    found.sort((a, b) => a.meta.title.localeCompare(b.meta.title));
    return found;
  }

  async getMeta(filePath: string): Promise<BookMeta> {
    return (await this.loadEntry(filePath)).meta;
  }

  async getChapter(filePath: string, index: number): Promise<ExtractedChapter> {
    const entry = await this.loadEntry(filePath);
    const bookDir = path.join(this.imageStorageDir, crypto.createHash('sha1').update(filePath).digest('hex'));
    let ordinal = 0;

    const saveImage = async (bytes: Buffer, ext: string): Promise<string> => {
      await fs.mkdir(bookDir, { recursive: true });
      const fileName = `${index}-${ordinal++}.${ext}`;
      const dest = path.join(bookDir, fileName);
      await fs.writeFile(dest, bytes);
      return vscode.Uri.file(dest).toString();
    };

    return entry.format.loadChapter(entry.zip, entry.meta, index, saveImage);
  }

  private async loadEntry(filePath: string): Promise<CacheEntry> {
    const format = formatForPath(filePath);
    if (!format) {
      throw new Error(`Unsupported book format: ${filePath}`);
    }

    const stat = await fs.stat(filePath);
    const cached = this.cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached;
    }

    const buffer = await fs.readFile(filePath);
    const { meta, zip } = await format.parseBuffer(buffer);
    const entry: CacheEntry = { mtimeMs: stat.mtimeMs, meta, zip, format };
    this.cache.set(filePath, entry);
    return entry;
  }

  invalidate(filePath: string) {
    this.cache.delete(filePath);
  }
}

async function findBookFiles(root: string, depth = 3): Promise<string[]> {
  const results: string[] = [];
  const extensions = allExtensions();

  async function walk(dir: string, remainingDepth: number) {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {continue;}
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (remainingDepth > 0) {await walk(full, remainingDepth - 1);}
      } else if (entry.isFile() && extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        results.push(full);
      }
    }
  }

  await walk(root, depth);
  return results;
}
