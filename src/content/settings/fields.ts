import type { ReaderPrefs } from '../../epub/readerPrefs';

export interface SegmentField {
  kind: 'segment';
  key: keyof ReaderPrefs;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface SliderField {
  kind: 'slider';
  key: keyof ReaderPrefs;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface ToggleField {
  kind: 'toggle';
  key: keyof ReaderPrefs;
  label: string;
  hint: string;
}

export type Field = SegmentField | SliderField | ToggleField;

export interface Card {
  title: string;
  fields: Field[];
}

const segment = (key: keyof ReaderPrefs, label: string, options: Array<[string, string]>): SegmentField => ({
  kind: 'segment',
  key,
  label,
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
});

const slider = (key: keyof ReaderPrefs, label: string): SliderField => ({
  kind: 'slider',
  key,
  label,
  min: 0,
  max: 500,
  step: 2,
});

const toggle = (key: keyof ReaderPrefs, label: string, hint: string): ToggleField => ({
  kind: 'toggle',
  key,
  label,
  hint,
});

export const CARDS: Card[] = [
  {
    title: 'Typeface',
    fields: [
      segment('fontFamily', 'Font Family', [
        ['serif', 'Serif'],
        ['sans', 'Sans'],
        ['mono', 'Mono'],
        ['dyslexic', 'Dyslexic'],
      ]),
      segment('fontWeight', 'Weight', [
        ['light', 'Light'],
        ['normal', 'Normal'],
        ['medium', 'Medium'],
        ['bold', 'Bold'],
      ]),
    ],
  },
  {
    title: 'Size & Rhythm',
    fields: [
      segment('fontSize', 'Font Size', [
        ['sm', 'S'],
        ['md', 'M'],
        ['lg', 'L'],
        ['xl', 'XL'],
        ['2xl', '2XL'],
      ]),
      segment('lineHeight', 'Line Height', [
        ['tight', 'Tight'],
        ['normal', 'Normal'],
        ['relaxed', 'Relaxed'],
        ['loose', 'Loose'],
      ]),
      segment('letterSpacing', 'Letter Spacing', [
        ['tight', 'Tight'],
        ['normal', 'Normal'],
        ['wide', 'Wide'],
        ['wider', 'Wider'],
      ]),
    ],
  },
  {
    title: 'Page Layout',
    fields: [
      segment('textAlign', 'Alignment', [
        ['left', 'Left'],
        ['justify', 'Justify'],
        ['center', 'Center'],
      ]),
      slider('marginX', 'Left / Right Margin'),
      slider('marginY', 'Top / Bottom Margin'),
    ],
  },
  {
    title: 'Reading Options',
    fields: [
      toggle('indent', 'Paragraph Indent', 'Indent first lines instead of spacing paragraphs'),
      toggle('twoPageMode', 'Two-Page Columns', 'Flow text into newspaper-style columns'),
      toggle('showChapterNumbers', 'Chapter Position', 'Show “3/24” in the reader footer'),
    ],
  },
];
