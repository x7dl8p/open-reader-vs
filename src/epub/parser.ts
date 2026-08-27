import JSZip, { type JSZipObject } from 'jszip';
import type { BookMeta, ExtractedChapter, SpineItem, TocItem } from './types';

/**
 * Node-side port of the web app's browser EPUB parser (src/lib/epub-parser.ts in the
 * main project). The parsing logic (container.xml / opf / spine / ncx / nav regex
 * scanning) is unchanged since it never touched the DOM; only the browser-only bits
 * (object URLs, performance.now console timing) are dropped or swapped for Node
 * equivalents (data: URIs, plain fs reads).
 */
export async function parseEpubBuffer(buffer: Buffer): Promise<{ meta: BookMeta; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  let opfPath = 'OEBPS/content.opf';
  if (containerXml) {
    const match = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (match && match[1]) {
      opfPath = match[1];
    }
  }

  if (!zip.file(opfPath)) {
    const foundOpf = Object.keys(zip.files).find((p) => p.toLowerCase().endsWith('.opf'));
    if (foundOpf) {
      opfPath = foundOpf;
    }
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error('Invalid EPUB: Package manifest (.opf) not found in archive.');
  }

  const opfText = await opfFile.async('text');

  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const title = titleMatch && titleMatch[1] ? cleanText(titleMatch[1]) : 'Untitled Novel';

  const creatorMatch = opfText.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const creator = creatorMatch && creatorMatch[1] ? cleanText(creatorMatch[1]) : undefined;

  const manifest = new Map<string, { href: string; rawHref: string; mediaType: string }>();
  const itemRegex = /<item\s+([^>]+)\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  let navHref: string | null = null;

  while ((itemMatch = itemRegex.exec(opfText)) !== null) {
    const attrs = itemMatch[1] || '';
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const mediaTypeMatch = attrs.match(/media-type=["']([^"']+)["']/i);
    const propertiesMatch = attrs.match(/properties=["']([^"']+)["']/i);

    if (idMatch && idMatch[1] && hrefMatch && hrefMatch[1]) {
      const id = idMatch[1];
      const rawHref = decodeURIComponent(hrefMatch[1]);
      const normalizedHref = normalizePath(opfDir + rawHref);
      const mediaType = mediaTypeMatch && mediaTypeMatch[1] ? mediaTypeMatch[1].toLowerCase() : '';

      manifest.set(id, { href: normalizedHref, rawHref, mediaType });

      const properties = propertiesMatch && propertiesMatch[1] ? propertiesMatch[1] : '';
      if (properties.split(/\s+/).includes('nav')) {
        navHref = normalizedHref;
      }
    }
  }

  const spine: SpineItem[] = [];
  const spineRegex = /<itemref\s+([^>]+)\/?>/gi;
  let spineMatch: RegExpExecArray | null;

  while ((spineMatch = spineRegex.exec(opfText)) !== null) {
    const itemAttrs = spineMatch[1] || '';
    const idrefMatch = itemAttrs.match(/idref=["']([^"']+)["']/i);
    if (idrefMatch && idrefMatch[1]) {
      const item = manifest.get(idrefMatch[1]);
      if (item) {
        spine.push({ id: idrefMatch[1], href: item.href, rawHref: item.rawHref, mediaType: item.mediaType });
      }
    }
  }

  let toc: TocItem[] = [];

  const ncxItem = Array.from(manifest.values()).find(
    (item) => item.mediaType === 'application/x-dtbncx+xml' || item.href.endsWith('.ncx')
  );

  if (ncxItem) {
    const ncxFile = zip.file(ncxItem.href) || zip.file(ncxItem.href.replace(/^\//, ''));
    if (ncxFile) {
      const ncxText = await ncxFile.async('text');
      toc = parseNcxToc(ncxText, opfDir);
    }
  }

  if (toc.length === 0) {
    const navItem =
      navHref !== null
        ? { href: navHref }
        : Array.from(manifest.values()).find(
            (item) => item.href.toLowerCase().includes('nav') || item.href.toLowerCase().includes('toc')
          );
    if (navItem) {
      const navFile = zip.file(navItem.href) || zip.file(navItem.href.replace(/^\//, ''));
      if (navFile) {
        const navText = await navFile.async('text');
        toc = parseNavToc(navText, opfDir);
      }
    }
  }

  if (toc.length === 0) {
    toc = spine.map((s, idx) => ({ id: s.id || String(idx), label: `Chapter ${idx + 1}`, href: s.href }));
  }

  for (const t of toc) {
    const targetPath = (t.href || '').split('#')[0] || '';
    if (targetPath) {
      const spineEntry = spine.find((s) => s.href === targetPath || s.href.endsWith(targetPath));
      if (spineEntry && !spineEntry.label) {
        spineEntry.label = t.label;
      }
    }
  }

  const meta: BookMeta = {
    title,
    creator,
    opfDir,
    spine,
    toc,
    totalChapters: spine.length > 0 ? spine.length : toc.length,
  };

  return { meta, zip };
}

/** Persists an extracted image and returns the src to use in its place (a data: URI if omitted). */
export type ImageSink = (bytes: Buffer, ext: string) => Promise<string>;

export async function loadChapterByIndex(
  zip: JSZip,
  meta: BookMeta,
  index: number,
  saveImage?: ImageSink
): Promise<ExtractedChapter> {
  const targetItem = meta.spine[index] || meta.toc[index];
  if (!targetItem) {
    throw new Error(`Chapter ${index + 1} not found in book index.`);
  }

  const rawPath = (targetItem.href || '').split('#')[0] || '';
  const possiblePaths = [rawPath, rawPath.replace(/^\//, ''), meta.opfDir + rawPath, meta.opfDir + rawPath.replace(/^\//, '')].filter(
    Boolean
  );

  let file: JSZipObject | null = null;
  for (const p of possiblePaths) {
    const found = zip.file(p);
    if (found) {
      file = found;
      break;
    }
  }

  if (!file && rawPath) {
    const fileName = rawPath.split('/').pop();
    if (fileName) {
      const matchKey = Object.keys(zip.files).find((k) => k.endsWith('/' + fileName) || k === fileName);
      if (matchKey) {
        file = zip.file(matchKey) || null;
      }
    }
  }

  if (!file) {
    return {
      title: targetItem.label || `Chapter ${index + 1}`,
      html: `<p>Chapter content not found at path: ${rawPath}</p>`,
    };
  }

  const rawContent = await file.async('text');
  const isMarkdown = rawPath.toLowerCase().endsWith('.md');
  const chapterDir = rawPath.includes('/') ? rawPath.substring(0, rawPath.lastIndexOf('/') + 1) : '';

  const htmlContent = isMarkdown ? rawContent : await processChapterHtml(rawContent, zip, chapterDir, saveImage);
  const title = targetItem.label || extractTitleFromHtml(rawContent) || `Chapter ${index + 1}`;

  return { title, html: htmlContent };
}

async function processChapterHtml(rawHtml: string, zip: JSZip, chapterDir: string, saveImage?: ImageSink): Promise<string> {
  let bodyContent = rawHtml;
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    bodyContent = bodyMatch[1];
  }

  bodyContent = bodyContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  const imgRegex = /<(img|image)\s+([^>]+)\/?>/gi;
  const matches: Array<{ full: string; attrs: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = imgRegex.exec(bodyContent)) !== null) {
    if (m[0] && m[2]) {
      matches.push({ full: m[0], attrs: m[2] });
    }
  }

  for (const match of matches) {
    const srcMatch = match.attrs.match(/(?:src|xlink:href)=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      const originalSrc = srcMatch[1];
      if (!originalSrc.startsWith('data:') && !originalSrc.startsWith('http')) {
        const decodedSrc = decodeURIComponent(originalSrc);
        const resolvedPath = normalizePath(chapterDir + decodedSrc);
        const imgFile =
          zip.file(resolvedPath) ||
          zip.file(resolvedPath.replace(/^\//, '')) ||
          zip.file(decodedSrc) ||
          zip.file(decodedSrc.replace(/^\//, ''));

        if (imgFile) {
          try {
            const ext = resolvedPath.split('.').pop()?.toLowerCase() || 'jpeg';
            const newSrc = saveImage
              ? await saveImage(await imgFile.async('nodebuffer'), ext)
              : dataUrl(await imgFile.async('base64'), ext);
            const newTag = match.full.replace(originalSrc, newSrc);
            bodyContent = bodyContent.replace(match.full, newTag);
          } catch {
            // leave the original (broken) src in place
          }
        }
      }
    }
  }

  return bodyContent;
}

function dataUrl(base64: string, ext: string): string {
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

function parseNcxToc(ncxText: string, opfDir: string): TocItem[] {
  const items: TocItem[] = [];
  const navPointRegex =
    /<navPoint[\s\S]*?<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>[\s\S]*?<content\s+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = navPointRegex.exec(ncxText)) !== null) {
    const rawLabel = match[1] || '';
    const rawSrc = match[2] || '';
    const label = cleanText(rawLabel);
    const src = decodeURIComponent(rawSrc);
    const normalizedHref = normalizePath(opfDir + src);

    items.push({ id: `ncx-${items.length}`, label: label || `Chapter ${items.length + 1}`, href: normalizedHref });
  }

  return items;
}

function parseNavToc(navText: string, opfDir: string): TocItem[] {
  const items: TocItem[] = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(navText)) !== null) {
    const rawHref = match[1] || '';
    const rawLabel = match[2] || '';
    const href = decodeURIComponent(rawHref);
    const label = cleanText(rawLabel.replace(/<[^>]+>/g, ''));
    if (label && href) {
      items.push({ id: `nav-${items.length}`, label, href: normalizePath(opfDir + href) });
    }
  }

  return items;
}

function extractTitleFromHtml(html: string): string | null {
  const h1Match = html.match(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/i);
  if (h1Match && h1Match[1]) {
    return cleanText(h1Match[1].replace(/<[^>]+>/g, ''));
  }
  return null;
}

function normalizePath(path: string): string {
  const segments = path.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '.' || segment === '') {continue;}
    if (segment === '..') {
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.join('/');
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
