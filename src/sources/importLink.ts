import * as fs from 'fs/promises';
import * as path from 'path';
import type { SourceItem } from './types';
import type { SourceManager } from './sourceManager';
import type { NovelStore, SavedNovel } from './novelStore';
import { allExtensions } from '../epub/formats';
import { USER_AGENT } from './runtime/fetch';

export type ImportResult =
  | { kind: 'book'; filePath: string }
  | { kind: 'novel'; filePath: string; novel: SavedNovel };

export interface ImportDeps {
  sources: SourceManager;
  novels: NovelStore;
  downloadsDir: string;
  /** Pick one of several sources serving the link's site, or confirm installing one. Undefined cancels. */
  chooseSource(candidates: SourceItem[], host: string): Promise<SourceItem | undefined>;
}

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024;

/**
 * Import whatever a link points at: a direct .epub/.cbz file is downloaded into the
 * library, and a novel page on a site some source serves is fetched through that source
 * and added to the library.
 */
export async function importFromLink(rawUrl: string, deps: ImportDeps): Promise<ImportResult | undefined> {
  const url = parseUrl(rawUrl);

  if (allExtensions().some((ext) => url.pathname.toLowerCase().endsWith(ext))) {
    return { kind: 'book', filePath: await downloadBook(url, deps.downloadsDir) };
  }

  const host = hostKey(url.hostname);
  const available = await deps.sources.listAvailable();
  const installedIds = new Set(deps.sources.installed().map((item) => item.id));
  const candidates = available
    .filter((item) => siteHost(item.site) === host)
    .sort((a, b) => Number(installedIds.has(b.id)) - Number(installedIds.has(a.id)));

  if (candidates.length === 0) {
    throw new Error(
      `No source in your repositories serves ${url.hostname}. Direct .epub and .cbz links work from anywhere; novel pages need a source for their site.`
    );
  }

  const installed = candidates.find((item) => installedIds.has(item.id));
  const source = installed ?? (await deps.chooseSource(candidates, url.hostname));
  if (!source) {
    return undefined;
  }
  if (!installedIds.has(source.id)) {
    await deps.sources.install(source);
  }

  const failures: string[] = [];
  let fallback: { filePath: string; novel: SavedNovel } | undefined;
  for (const novelPath of candidatePaths(url, source.site)) {
    try {
      const saved = await deps.novels.fetchAndSave(source.id, novelPath, true);
      if (saved.novel.chapters.length > 0) {
        return { kind: 'novel', ...saved };
      }
      fallback ??= saved;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (fallback) {
    return { kind: 'novel', ...fallback };
  }
  throw new Error(
    `${source.name} could not read a novel at this link. Use the novel's main page, not a chapter page.${failures[0] ? `\n${failures[0]}` : ''}`
  );
}

function parseUrl(raw: string): URL {
  const trimmed = raw.trim();
  try {
    return new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`"${trimmed}" is not a link`);
  }
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^(www|m)\./, '');
}

function siteHost(site: string): string {
  try {
    return hostKey(new URL(site).hostname);
  } catch {
    return '';
  }
}

/**
 * Plugins disagree on what a novel "path" is, `novel/x/`, `/novel/x/` or a full URL , 
 * so each form is tried in turn, the site's own base path stripped first.
 */
function candidatePaths(url: URL, site: string): string[] {
  let rel = url.pathname + url.search;
  try {
    const base = new URL(site).pathname.replace(/\/$/, '');
    if (base && rel.startsWith(base + '/')) {
      rel = rel.slice(base.length);
    }
  } catch {
    // Keep the full path.
  }
  const noSlash = rel.replace(/^\/+/, '');
  return [...new Set([noSlash, `/${noSlash}`, url.toString()])];
}

async function downloadBook(url: URL, downloadsDir: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status})`);
  }
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) {
    throw new Error('That file is larger than 300 MB.');
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error('That file is larger than 300 MB.');
  }
  // Books are zip archives; anything else is an error page, not a book.
  if (bytes.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new Error('The link did not return an EPUB/CBZ file.');
  }

  await fs.mkdir(downloadsDir, { recursive: true });
  const raw = decodeURIComponent(path.basename(url.pathname)) || 'book.epub';
  const safe = raw.replace(/[^\w.\- ()[\]]+/g, '_');
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let dest = path.join(downloadsDir, safe);
  for (let n = 2; await exists(dest); n++) {
    dest = path.join(downloadsDir, `${stem} (${n})${ext}`);
  }
  await fs.writeFile(dest, bytes);
  return dest;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
