import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type JSZip from 'jszip';
import { loadChapterByIndex, parseEpubBuffer } from './parser';
import type { BookMeta, ExtractedChapter } from './types';

export interface LibraryBook {
  filePath: string;
  fileName: string;
  meta: BookMeta;
}

interface CacheEntry {
  mtimeMs: number;
  meta: BookMeta;
  zip: JSZip;
}

/**
 * Scans the configured library folders for .epub files and parses them on demand.
 * Parsed archives are kept in memory keyed by file path + mtime, so re-opening the
 * same book (or re-expanding the tree) doesn't re-unzip it.
 */
export class Library {
  private cache = new Map<string, CacheEntry>();

  constructor(private imageStorageDir: string) {}

  getLibraryFolders(): string[] {
    const configured = vscode.workspace.getConfiguration('bookReader').get<string[]>('libraryFolders') ?? [];
    if (configured.length > 0) {return configured;}

    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  async listBooks(): Promise<LibraryBook[]> {
    const folders = this.getLibraryFolders();
    const found: LibraryBook[] = [];

    for (const folder of folders) {
      const files = await findEpubFiles(folder);
      for (const filePath of files) {
        try {
          const entry = await this.loadEntry(filePath);
          found.push({ filePath, fileName: path.basename(filePath), meta: entry.meta });
        } catch (err) {
          console.error(`[book-reader] Failed to parse ${filePath}:`, err);
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

    return loadChapterByIndex(entry.zip, entry.meta, index, saveImage);
  }

  private async loadEntry(filePath: string): Promise<CacheEntry> {
    const stat = await fs.stat(filePath);
    const cached = this.cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached;
    }

    const buffer = await fs.readFile(filePath);
    const { meta, zip } = await parseEpubBuffer(buffer);
    const entry: CacheEntry = { mtimeMs: stat.mtimeMs, meta, zip };
    this.cache.set(filePath, entry);
    return entry;
  }

  invalidate(filePath: string) {
    this.cache.delete(filePath);
  }
}

async function findEpubFiles(root: string, depth = 3): Promise<string[]> {
  const results: string[] = [];

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
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.epub')) {
        results.push(full);
      }
    }
  }

  await walk(root, depth);
  return results;
}
