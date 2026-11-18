import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type JSZip from 'jszip';
import type { BookMeta, ExtractedChapter } from './types';
import { allExtensions, formatForPath, type BookFormat } from './formats';
import type { NovelStore } from '../sources/novelStore';
import type { TitleStore } from './titleStore';

export interface LibraryBook {
  filePath: string;
  fileName: string;
  meta: BookMeta;
  /** Set for novels added from an online source; their chapters are fetched on demand. */
  online?: { sourceName: string; url: string };
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

  constructor(
    private imageStorageDir: string,
    /** Books imported from a link land here, and it is always part of the library. */
    readonly downloadsDir: string,
    private online?: NovelStore,
    private titles?: TitleStore
  ) {}

  /** The book's metadata with any name the user gave it through Rename. */
  private withTitle(filePath: string, meta: BookMeta): BookMeta {
    const title = this.titles?.get(filePath);
    return title ? { ...meta, title } : meta;
  }

  isOnline(filePath: string): boolean {
    return this.online?.owns(filePath) ?? false;
  }

  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  private configuredFolders(): string[] {
    return vscode.workspace.getConfiguration('openReader').get<string[]>('libraryFolders') ?? [];
  }

  /**
   * Books come from the workspace *and* every folder added with "Add Library Folder",
   * so a book you add is always readable no matter where it lives on disk.
   */
  getBookFolders(): string[] {
    return dedupeFolders([...this.workspaceFolders(), ...this.configuredFolders(), this.downloadsDir]);
  }

  /**
   * The eye/file view browses the project you have open, the same tree the Explorer
   * shows. Added folders feed the book list, not this. With no workspace open there is
   * nothing to browse, so the added folders stand in.
   */
  getBrowseFolders(): string[] {
    const workspace = this.workspaceFolders();
    return workspace.length > 0 ? workspace : this.configuredFolders();
  }

  async listBooks(): Promise<LibraryBook[]> {
    const folders = this.getBookFolders();
    const found: LibraryBook[] = [];
    const seen = new Set<string>();

    for (const folder of folders) {
      const files = await findBookFiles(folder);
      for (const filePath of files) {
        // Two roots can reach the same file through different paths or a symlink;
        // the library must list it once.
        const identity = await realPath(filePath);
        if (seen.has(identity)) {continue;}
        seen.add(identity);

        try {
          const entry = await this.loadEntry(filePath);
          found.push({ filePath, fileName: path.basename(filePath), meta: this.withTitle(filePath, entry.meta) });
        } catch (err) {
          console.error(`[open-reader] Failed to parse ${filePath}:`, err);
        }
      }
    }

    found.sort((a, b) => a.meta.title.localeCompare(b.meta.title));

    // Online novels follow the local books, most recently added first.
    for (const { filePath, novel } of (await this.online?.listLibrary()) ?? []) {
      try {
        found.push({
          filePath,
          fileName: novel.name,
          meta: this.withTitle(filePath, await this.online!.getMeta(filePath)),
          online: { sourceName: novel.sourceName, url: novel.url },
        });
      } catch (err) {
        console.error(`[open-reader] Failed to read saved novel ${filePath}:`, err);
      }
    }
    return found;
  }

  async getMeta(filePath: string): Promise<BookMeta> {
    if (this.online?.owns(filePath)) {
      return this.withTitle(filePath, await this.online.getMeta(filePath));
    }
    return this.withTitle(filePath, (await this.loadEntry(filePath)).meta);
  }

  async getChapter(filePath: string, index: number): Promise<ExtractedChapter> {
    if (this.online?.owns(filePath)) {
      return this.online.getChapter(filePath, index);
    }
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

/** Resolve symlinks so the same book reached two ways compares equal. */
async function realPath(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Normalise the roots and drop any folder already covered by another, scanning both
 * `/books` and `/books/epub` would otherwise find every book inside twice.
 */
function dedupeFolders(folders: string[]): string[] {
  const normalized = [...new Set(folders.map((folder) => path.resolve(folder)))];
  return normalized.filter(
    (folder) => !normalized.some((other) => other !== folder && folder.startsWith(other + path.sep))
  );
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
