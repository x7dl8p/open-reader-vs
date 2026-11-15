/**
 * The LNReader plugin contract (lnreader-plugins/src/types/plugin.ts), restated here so
 * the extension can host the same compiled plugin files the LNReader app uses.
 */

/** One entry in a repository's plugins.min.json. */
export interface SourceItem {
  id: string;
  name: string;
  site: string;
  lang: string;
  version: string;
  url: string;
  iconUrl: string;
  customJS?: string;
  customCSS?: string;
}

export interface NovelItem {
  name: string;
  path: string;
  cover?: string;
}

export interface ChapterItem {
  name: string;
  path: string;
  releaseTime?: string | null;
  chapterNumber?: number;
  page?: string;
  scanlator?: string | string[];
}

export interface SourceNovel extends NovelItem {
  genres?: string;
  summary?: string;
  author?: string;
  artist?: string;
  status?: string;
  rating?: number;
  chapters?: ChapterItem[];
  totalPages?: number;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface Filter {
  label: string;
  type: 'Text' | 'Picker' | 'Checkbox' | 'Switch' | 'XCheckbox';
  value: unknown;
  options?: FilterOption[];
}

export type Filters = Record<string, Filter>;
export type FilterValues = Record<string, { type: Filter['type']; value: unknown }>;

export interface ImageRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** A loaded plugin instance, what a compiled plugin's `exports.default` is. */
export interface SourcePlugin {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  filters?: Filters;
  imageRequestInit?: ImageRequestInit;
  popularNovels(pageNo: number, options: { showLatestNovels?: boolean; filters?: FilterValues }): Promise<NovelItem[]>;
  parseNovel(novelPath: string): Promise<SourceNovel>;
  parsePage?(novelPath: string, page: string): Promise<{ chapters: ChapterItem[] }>;
  parseChapter(chapterPath: string): Promise<string>;
  searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
  resolveUrl?(path: string, isNovel?: boolean): string;
}

export const OFFICIAL_REPOSITORY =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json';
