export interface TocItem {
  id: string;
  label: string;
  href: string;
}

export interface SpineItem {
  id: string;
  href: string;
  rawHref: string;
  mediaType: string;
  label?: string;
}

export interface BookMeta {
  title: string;
  creator?: string;
  opfDir: string;
  spine: SpineItem[];
  toc: TocItem[];
  totalChapters: number;
}

export interface ExtractedChapter {
  title: string;
  html: string;
}
