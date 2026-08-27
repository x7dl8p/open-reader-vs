import * as vscode from 'vscode';

/**
 * Same shape and defaults as the web app's ReaderPrefs (src/lib/epub-store.ts in the
 * main project), minus `maxWidth` — the web app dropped its UI control for that and
 * always reads full-width now, so there's nothing to port there.
 */
export interface ReaderPrefs {
  fontFamily: 'serif' | 'sans' | 'mono' | 'dyslexic';
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
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
  fontSize: 'md',
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

export function loadReaderPrefs(): ReaderPrefs {
  const config = vscode.workspace.getConfiguration('openReader');
  const prefs = { ...DEFAULT_READER_PREFS };
  for (const key of KEYS) {
    (prefs as Record<string, unknown>)[key] = config.get(key, DEFAULT_READER_PREFS[key]);
  }
  return prefs;
}

export async function updateReaderPref<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]): Promise<void> {
  await vscode.workspace.getConfiguration('openReader').update(key, value, vscode.ConfigurationTarget.Global);
}

export function isReaderPrefsChange(e: vscode.ConfigurationChangeEvent): boolean {
  return KEYS.some((key) => e.affectsConfiguration(`openReader.${key}`));
}
