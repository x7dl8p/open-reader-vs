import type JSZip from 'jszip';
import type { BookMeta, ExtractedChapter } from './types';
import type { ImageSink } from './parser';
import { loadChapterByIndex, parseEpubBuffer } from './parser';
import { loadCbzPageByIndex, parseCbzBuffer } from './cbzParser';

export interface BookFormat {
  extensions: string[];
  parseBuffer(buffer: Buffer): Promise<{ meta: BookMeta; zip: JSZip }>;
  loadChapter(zip: JSZip, meta: BookMeta, index: number, saveImage: ImageSink): Promise<ExtractedChapter>;
}

const EPUB: BookFormat = {
  extensions: ['.epub'],
  parseBuffer: parseEpubBuffer,
  loadChapter: loadChapterByIndex,
};

const CBZ: BookFormat = {
  extensions: ['.cbz'],
  parseBuffer: parseCbzBuffer,
  loadChapter: loadCbzPageByIndex,
};

export const SUPPORTED_FORMATS: BookFormat[] = [EPUB, CBZ];

export function formatForPath(filePath: string): BookFormat | undefined {
  const lower = filePath.toLowerCase();
  return SUPPORTED_FORMATS.find((format) => format.extensions.some((ext) => lower.endsWith(ext)));
}

export function allExtensions(): string[] {
  return SUPPORTED_FORMATS.flatMap((format) => format.extensions);
}
