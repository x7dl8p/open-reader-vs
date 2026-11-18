import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { load } from 'cheerio';
import type { BookMeta, ExtractedChapter } from '../epub/types';
import type { ChapterItem, SourceNovel, SourcePlugin } from './types';
import { SourceManager } from './sourceManager';
import type { ReadStore } from '../epub/readStore';

const MAX_PAGES = 200;

/** A novel fetched from a source, saved as JSON. Its file path is its identity in the library. */
export interface SavedNovel {
  version: 1;
  sourceId: string;
  sourceName: string;
  path: string;
  url: string;
  name: string;
  cover?: string;
  author?: string;
  summary?: string;
  genres?: string;
  status?: string;
  chapters: ChapterItem[];
  inLibrary: boolean;
  addedAt: number;
  updatedAt: number;
}

/**
 * Online novels the user has opened or added from a source. Each one is a JSON file in
 * `<globalStorage>/novels`, and that file's path stands in for the book's path
 * everywhere else, so progress, scroll position and the tree work unchanged.
 * Chapters are fetched on first read and cached next to it.
 */
export class NovelStore {
  private readonly dir: string;
  private cache = new Map<string, SavedNovel>();

  constructor(storageDir: string, private sources: SourceManager, private readStore?: ReadStore) {
    this.dir = path.join(storageDir, 'novels');
  }

  owns(filePath: string): boolean {
    return filePath.startsWith(this.dir + path.sep) && filePath.endsWith('.json');
  }

  fileFor(sourceId: string, novelPath: string): string {
    const hash = crypto.createHash('sha1').update(`${sourceId}\n${novelPath}`).digest('hex').slice(0, 20);
    return path.join(this.dir, `${hash}.json`);
  }

  async read(filePath: string): Promise<SavedNovel> {
    const cached = this.cache.get(filePath);
    if (cached) {
      return cached;
    }
    const novel = JSON.parse(await fs.readFile(filePath, 'utf8')) as SavedNovel;
    this.cache.set(filePath, novel);
    return novel;
  }

  async find(sourceId: string, novelPath: string): Promise<{ filePath: string; novel: SavedNovel } | undefined> {
    const filePath = this.fileFor(sourceId, novelPath);
    try {
      return { filePath, novel: await this.read(filePath) };
    } catch {
      return undefined;
    }
  }

  /** Novels marked "in library", newest first. */
  async listLibrary(): Promise<Array<{ filePath: string; novel: SavedNovel }>> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const out: Array<{ filePath: string; novel: SavedNovel }> = [];
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      const filePath = path.join(this.dir, name);
      try {
        const novel = await this.read(filePath);
        if (novel.inLibrary) {
          out.push({ filePath, novel });
        }
      } catch {
        // A half-written or foreign file is not a novel.
      }
    }
    return out.sort((a, b) => b.novel.addedAt - a.novel.addedAt);
  }

  /**
   * Fetch a novel's details and full chapter list from its source and save them.
   * Keeps the library flag of an existing save unless one is given.
   */
  async fetchAndSave(sourceId: string, novelPath: string, inLibrary?: boolean): Promise<{ filePath: string; novel: SavedNovel }> {
    const plugin = await this.sources.load(sourceId);
    const details = await plugin.parseNovel(novelPath);
    if (!details || !details.name) {
      throw new Error('The source returned no novel at this address.');
    }
    const chapters = await collectChapters(plugin, novelPath, details);
    const existing = await this.find(sourceId, novelPath);
    const now = Date.now();

    const novel: SavedNovel = {
      version: 1,
      sourceId,
      sourceName: plugin.name,
      path: novelPath,
      url: SourceManager.resolveUrl(plugin, novelPath, true),
      name: details.name.trim(),
      cover: details.cover,
      author: details.author,
      summary: details.summary,
      genres: details.genres,
      status: details.status,
      chapters,
      inLibrary: inLibrary ?? existing?.novel.inLibrary ?? false,
      addedAt: existing?.novel.addedAt ?? now,
      updatedAt: now,
    };
    if (inLibrary && !existing?.novel.inLibrary) {
      novel.addedAt = now;
    }
    const filePath = this.fileFor(sourceId, novelPath);
    await this.write(filePath, novel);
    if (existing) {
      // A new or reordered chapter list must not move the read marks onto other chapters.
      await this.readStore?.remap(
        filePath,
        existing.novel.chapters.map((c) => c.path),
        chapters.map((c) => c.path)
      );
    }
    return { filePath, novel };
  }

  async setInLibrary(filePath: string, inLibrary: boolean): Promise<SavedNovel> {
    const novel = { ...(await this.read(filePath)), inLibrary };
    if (inLibrary) {
      novel.addedAt = Date.now();
    }
    await this.write(filePath, novel);
    return novel;
  }

  async remove(filePath: string): Promise<void> {
    this.cache.delete(filePath);
    await fs.rm(filePath, { force: true });
    await fs.rm(this.chapterDir(filePath), { recursive: true, force: true });
  }

  async getMeta(filePath: string): Promise<BookMeta> {
    const novel = await this.read(filePath);
    const items = novel.chapters.map((chapter, index) => ({
      id: String(index),
      href: chapter.path,
      rawHref: chapter.path,
      mediaType: 'text/html',
      label: chapter.name,
    }));
    return {
      title: novel.name,
      creator: novel.author || novel.sourceName,
      opfDir: '',
      spine: items,
      toc: items.map(({ id, label, href }) => ({ id, label, href })),
      totalChapters: items.length,
    };
  }

  async getChapter(filePath: string, index: number): Promise<ExtractedChapter> {
    const novel = await this.read(filePath);
    const chapter = novel.chapters[index];
    if (!chapter) {
      throw new Error(`Chapter ${index + 1} does not exist`);
    }
    const cacheFile = this.chapterFile(filePath, chapter.path);
    try {
      return { title: chapter.name, html: await fs.readFile(cacheFile, 'utf8') };
    } catch {
      // Not downloaded yet.
    }
    const html = await this.fetchChapter(novel, chapter, cacheFile);
    return {
      title: chapter.name,
      html: html.trim() || '<p><em>This chapter came back empty. The source may need you to open it in a browser first.</em></p>',
    };
  }

  /** Indexes of the chapters stored on disk, read once, or downloaded. */
  async downloadedIndexes(filePath: string): Promise<Set<number>> {
    const novel = await this.read(filePath);
    let files: Set<string>;
    try {
      files = new Set(await fs.readdir(this.chapterDir(filePath)));
    } catch {
      return new Set();
    }
    const out = new Set<number>();
    novel.chapters.forEach((chapter, index) => {
      if (files.has(path.basename(this.chapterFile(filePath, chapter.path)))) {
        out.add(index);
      }
    });
    return out;
  }

  /** Fetch one chapter to disk unless it is already there. Throws when the source fails. */
  async downloadChapter(filePath: string, index: number): Promise<void> {
    const novel = await this.read(filePath);
    const chapter = novel.chapters[index];
    if (!chapter) {
      return;
    }
    const cacheFile = this.chapterFile(filePath, chapter.path);
    try {
      await fs.access(cacheFile);
      return;
    } catch {
      // Needs fetching.
    }
    const html = await this.fetchChapter(novel, chapter, cacheFile);
    if (!html.trim()) {
      throw new Error(`“${chapter.name}” came back empty`);
    }
  }

  async deleteDownloads(filePath: string, indexes?: number[]): Promise<void> {
    if (!indexes) {
      await fs.rm(this.chapterDir(filePath), { recursive: true, force: true });
      return;
    }
    const novel = await this.read(filePath);
    await Promise.all(
      indexes
        .map((i) => novel.chapters[i])
        .filter(Boolean)
        .map((chapter) => fs.rm(this.chapterFile(filePath, chapter.path), { force: true }))
    );
  }

  private async fetchChapter(novel: SavedNovel, chapter: ChapterItem, cacheFile: string): Promise<string> {
    const plugin = await this.sources.load(novel.sourceId);
    const raw = await plugin.parseChapter(chapter.path);
    const html = sanitizeChapterHtml(raw, SourceManager.resolveUrl(plugin, chapter.path, false));
    if (html.trim()) {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, html);
    }
    return html;
  }

  /** Keyed by the chapter's path, so a refreshed (reordered) list keeps its downloads. */
  private chapterFile(filePath: string, chapterPath: string): string {
    const hash = crypto.createHash('sha1').update(chapterPath).digest('hex').slice(0, 20);
    return path.join(this.chapterDir(filePath), `${hash}.html`);
  }

  private chapterDir(filePath: string): string {
    return filePath.replace(/\.json$/, '');
  }

  private async write(filePath: string, novel: SavedNovel): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(novel));
    await fs.rename(tmp, filePath);
    this.cache.set(filePath, novel);
  }
}

/** Chapters from parseNovel, plus every further page for paged sources. */
async function collectChapters(plugin: SourcePlugin, novelPath: string, details: SourceNovel): Promise<ChapterItem[]> {
  const chapters = [...(details.chapters ?? [])];
  const totalPages = Number(details.totalPages ?? 0);
  if (plugin.parsePage && totalPages > 0 && chapters.length === 0) {
    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
      const result = await plugin.parsePage(novelPath, String(page));
      chapters.push(...(result?.chapters ?? []));
    }
  }
  return chapters.map((chapter) => ({ name: String(chapter.name ?? '').trim() || 'Untitled', path: chapter.path, releaseTime: chapter.releaseTime ?? null }));
}

const PRESENTATION_ATTRS = new Set(['style', 'face', 'color', 'size', 'align', 'bgcolor', 'width', 'height']);
const DROP_TAGS = 'script, iframe, frame, frameset, object, embed, form, input, button, select, textarea, link, meta, base, noscript, style, svg';

/**
 * Chapter HTML comes from a scraped site and renders in a webview that runs scripts,
 * so anything executable or form-like is removed and relative images are made absolute.
 */
function sanitizeChapterHtml(html: string, baseUrl: string): string {
  const $ = load(html ?? '', null, false);
  $(DROP_TAGS).remove();
  $('*').each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs ?? {};
    for (const name of Object.keys(attribs)) {
      const value = attribs[name] ?? '';
      // Inline styling from the site would override the reader's own typography settings.
      if (PRESENTATION_ATTRS.has(name) || name.startsWith('on') || /^\s*(javascript|vbscript|data:text)/i.test(value)) {
        $(el).removeAttr(name);
      }
    }
  });
  $('img').each((_, el) => {
    const img = $(el);
    const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
    if (!src) {
      img.remove();
      return;
    }
    try {
      img.attr('src', new URL(src, baseUrl).toString());
    } catch {
      img.remove();
    }
  });
  $('a[href]').each((_, el) => {
    $(el).removeAttr('href');
  });
  return $.html();
}
