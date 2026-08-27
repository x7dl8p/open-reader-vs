import JSZip from 'jszip';
import type { BookMeta, ExtractedChapter, TocItem } from './types';
import type { ImageSink } from './parser';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;

/** CBZ is just a zip of page images. Each page becomes one "chapter" entry so it can
 * reuse the same spine/toc/tree/progress machinery as EPUB. */
export async function parseCbzBuffer(buffer: Buffer): Promise<{ meta: BookMeta; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);

  const pages = Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir && IMAGE_EXT.test(path))
    .sort(naturalCompare);

  if (pages.length === 0) {
    throw new Error('Invalid CBZ: no image pages found in archive.');
  }

  const toc: TocItem[] = pages.map((path, index) => ({
    id: `page-${index}`,
    label: `Page ${index + 1}`,
    href: path,
  }));

  const meta: BookMeta = {
    title: 'Untitled Comic',
    opfDir: '',
    spine: toc.map((t) => ({ id: t.id, href: t.href, rawHref: t.href, mediaType: 'image', label: t.label })),
    toc,
    totalChapters: pages.length,
  };

  return { meta, zip };
}

export async function loadCbzPageByIndex(
  zip: JSZip,
  meta: BookMeta,
  index: number,
  saveImage: ImageSink
): Promise<ExtractedChapter> {
  const page = meta.spine[index];
  if (!page) {
    throw new Error(`Page ${index + 1} not found in comic.`);
  }

  const file = zip.file(page.href);
  if (!file) {
    return { title: page.label || `Page ${index + 1}`, html: `<p>Page image not found: ${page.href}</p>` };
  }

  const bytes = await file.async('nodebuffer');
  const ext = page.href.split('.').pop()?.toLowerCase() || 'jpeg';
  const src = await saveImage(bytes, ext);

  return { title: page.label || `Page ${index + 1}`, html: `<img src="${src}" alt="${page.label}">` };
}

/** Sorts "page2.jpg" before "page10.jpg" instead of lexicographic "page10" < "page2". */
function naturalCompare(a: string, b: string): number {
  const splitA = a.match(/\d+|\D+/g) ?? [a];
  const splitB = b.match(/\d+|\D+/g) ?? [b];
  const len = Math.min(splitA.length, splitB.length);

  for (let i = 0; i < len; i++) {
    const partA = splitA[i];
    const partB = splitB[i];
    const numA = Number(partA);
    const numB = Number(partB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && partA !== undefined && partB !== undefined) {
      if (numA !== numB) {return numA - numB;}
    } else if (partA !== partB) {
      return (partA ?? '') < (partB ?? '') ? -1 : 1;
    }
  }
  return splitA.length - splitB.length;
}
