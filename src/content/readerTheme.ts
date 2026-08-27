import type { ReaderPrefs } from '../epub/readerPrefs';

type LookupSpec = Record<string, [string, Record<string, string | number>]>;
type DirectSpec = Record<string, string>;
type BoolSpec = Record<string, { on: Record<string, string>; off: Record<string, string> }>;
type ColorSpec = Record<string, [string, string]>;

const FONT_FAMILIES: Record<string, string> = {
  serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'SF Mono', Consolas, 'Courier New', monospace",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
};

const FONT_SIZES: Record<string, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
};

const FONT_WEIGHTS: Record<string, number> = {
  light: 300,
  normal: 400,
  medium: 500,
  bold: 700,
};

const LINE_HEIGHTS: Record<string, number> = {
  tight: 1.3,
  normal: 1.5,
  relaxed: 1.7,
  loose: 2,
};

const LETTER_SPACINGS: Record<string, string> = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.02em',
  wider: '0.04em',
};

export const THEME_SPEC: {
  lookup: LookupSpec;
  direct: DirectSpec;
  px: DirectSpec;
  bool: BoolSpec;
  color: ColorSpec;
} = {
  lookup: {
    fontFamily: ['--reader-font', FONT_FAMILIES],
    fontSize: ['--reader-size', FONT_SIZES],
    fontWeight: ['--reader-weight', FONT_WEIGHTS],
    lineHeight: ['--reader-leading', LINE_HEIGHTS],
    letterSpacing: ['--reader-tracking', LETTER_SPACINGS],
  },
  direct: {
    textAlign: '--reader-align',
  },
  px: {
    marginX: '--reader-margin-x',
    marginY: '--reader-margin-y',
  },
  bool: {
    indent: {
      on: { '--reader-indent': '2em', '--reader-para-margin': '0' },
      off: { '--reader-indent': '0', '--reader-para-margin': '0 0 1em' },
    },
    twoPageMode: {
      on: { '--reader-columns': '320px' },
      off: { '--reader-columns': 'auto' },
    },
    showChapterNumbers: {
      on: { '--reader-position-display': 'inline' },
      off: { '--reader-position-display': 'none' },
    },
  },
  color: {
    bgColor: ['--reader-bg', 'var(--vscode-editor-background)'],
    textColor: ['--reader-fg', 'var(--vscode-editor-foreground)'],
  },
};

export function prefsToCssVars(prefs: ReaderPrefs): Record<string, string> {
  const source = prefs as unknown as Record<string, string | number | boolean>;
  const vars: Record<string, string> = {};

  for (const [key, [name, table]] of Object.entries(THEME_SPEC.lookup)) {
    vars[name] = String(table[String(source[key])]);
  }
  for (const [key, name] of Object.entries(THEME_SPEC.direct)) {
    vars[name] = String(source[key]);
  }
  for (const [key, name] of Object.entries(THEME_SPEC.px)) {
    vars[name] = `${Number(source[key])}px`;
  }
  for (const [key, pair] of Object.entries(THEME_SPEC.bool)) {
    Object.assign(vars, source[key] ? pair.on : pair.off);
  }
  for (const [key, [name, fallback]] of Object.entries(THEME_SPEC.color)) {
    vars[name] = String(source[key] || fallback);
  }

  return vars;
}

export function cssVarsToDeclarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
