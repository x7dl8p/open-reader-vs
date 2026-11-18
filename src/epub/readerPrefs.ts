import * as vscode from 'vscode';

/**
 * Same shape and defaults as the web app's ReaderPrefs (src/lib/epub-store.ts in the
 * main project), minus `maxWidth`, the web app dropped its UI control for that and
 * always reads full-width now, so there's nothing to port there.
 */
export interface ReaderPrefs {
  fontFamily: 'serif' | 'sans' | 'mono' | 'dyslexic';
  /** Pixels. Older versions stored a size name, see LEGACY_FONT_SIZES. */
  fontSize: number;
  fontWeight: 'light' | 'normal' | 'medium' | 'bold';
  lineHeight: 'tight' | 'normal' | 'relaxed' | 'loose';
  letterSpacing: 'tight' | 'normal' | 'wide' | 'wider';
  textAlign: 'left' | 'justify' | 'center';
  indent: boolean;
  showChapterNumbers: boolean;
  twoPageMode: boolean;
  marginX: number;
  marginY: number;
  bgColor: string;
  textColor: string;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontFamily: 'serif',
  fontSize: 16,
  fontWeight: 'normal',
  lineHeight: 'relaxed',
  letterSpacing: 'normal',
  textAlign: 'left',
  indent: true,
  showChapterNumbers: true,
  twoPageMode: false,
  marginX: 34,
  marginY: 11,
  bgColor: '',
  textColor: '',
};

export const PREBUILT_THEMES: Array<{ id: string; name: string; bg: string; text: string }> = [
  { id: 'default', name: 'Default (follow VS Code theme)', bg: '', text: '' },
  { id: 'ivory', name: 'Warm Ivory', bg: '#FDFBF7', text: '#2D2A26' },
  { id: 'sepia', name: 'Classic Sepia', bg: '#F4ECD8', text: '#5B4636' },
  { id: 'dark-parchment', name: 'Dark Parchment', bg: '#1E1C1A', text: '#E6E1DA' },
  { id: 'midnight', name: 'OLED Midnight', bg: '#000000', text: '#D1D5DB' },
];

const KEYS = Object.keys(DEFAULT_READER_PREFS) as Array<keyof ReaderPrefs>;

export const FONT_SIZE_MIN = 10;
/** Four times the old largest size (2XL, 24px). */
export const FONT_SIZE_MAX = 96;
const LEGACY_FONT_SIZES: Record<string, number> = { sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24 };

/** A stored font size as pixels: numbers are clamped, old size names are translated. */
function toFontSize(value: unknown): number {
  const px = typeof value === 'string' ? (LEGACY_FONT_SIZES[value] ?? Number(value)) : Number(value);
  if (!Number.isFinite(px)) {
    return DEFAULT_READER_PREFS.fontSize;
  }
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(px)));
}

/**
 * The two reading surfaces are styled independently: the editor-area reader ('main')
 * keeps the original flat openReader.* keys, the sidebar Reader view ('side') keeps its
 * copy in the openReader.sidePanel object.
 */
export type ReaderSurface = 'main' | 'side';

const SIDE_KEY = 'sidePanel';

export function loadReaderPrefs(surface: ReaderSurface): ReaderPrefs {
  const config = vscode.workspace.getConfiguration('openReader');
  const prefs = { ...DEFAULT_READER_PREFS };
  if (surface === 'side') {
    const stored = config.get<Partial<ReaderPrefs>>(SIDE_KEY) ?? {};
    for (const key of KEYS) {
      if (key !== 'fontSize' && typeof stored[key] === typeof DEFAULT_READER_PREFS[key]) {
        (prefs as Record<string, unknown>)[key] = stored[key];
      }
    }
    prefs.fontSize = toFontSize(stored.fontSize ?? DEFAULT_READER_PREFS.fontSize);
    return prefs;
  }
  for (const key of KEYS) {
    (prefs as Record<string, unknown>)[key] = config.get(key, DEFAULT_READER_PREFS[key]);
  }
  prefs.fontSize = toFontSize(prefs.fontSize);
  return prefs;
}

/** Write several prefs for one surface. The side surface is one object, so it is written once. */
export async function updateReaderPrefs(surface: ReaderSurface, patch: Partial<ReaderPrefs>): Promise<void> {
  const config = vscode.workspace.getConfiguration('openReader');
  if (surface === 'side') {
    const next = { ...loadReaderPrefs('side'), ...patch };
    await config.update(SIDE_KEY, next, vscode.ConfigurationTarget.Global);
    return;
  }
  for (const [key, value] of Object.entries(patch)) {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Before the split, one set of prefs styled both surfaces. Seed the side panel with
 * those values once, so an upgrade changes nothing until the user edits a tab.
 */
export async function migrateSidePrefs(): Promise<void> {
  const config = vscode.workspace.getConfiguration('openReader');
  if (config.inspect(SIDE_KEY)?.globalValue !== undefined) {
    return;
  }
  await config.update(SIDE_KEY, loadReaderPrefs('main'), vscode.ConfigurationTarget.Global);
}

export function isReaderPrefsChange(e: vscode.ConfigurationChangeEvent, surface: ReaderSurface): boolean {
  if (surface === 'side') {
    return e.affectsConfiguration(`openReader.${SIDE_KEY}`);
  }
  return KEYS.some((key) => e.affectsConfiguration(`openReader.${key}`));
}
