import { PREBUILT_THEMES, type ReaderPrefs, type ReaderSurface } from '../../epub/readerPrefs';
import { CARDS, type Card, type Field } from './fields';
import { settingsStyles } from './styles';
import { settingsScript } from './script';

const SAMPLE = [
  'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
  'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
  '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
  'Mr. Bennet replied that he had not.',
  '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”',
];

const TABS: Array<{ surface: ReaderSurface; label: string; hint: string }> = [
  { surface: 'main', label: 'Main Area', hint: 'The reader that opens in the editor area' },
  { surface: 'side', label: 'Side Panel', hint: 'The Reader view in the Open-Reader sidebar' },
];

export function renderSettingsHtml(prefs: Record<ReaderSurface, ReaderPrefs>, activeTab: ReaderSurface): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>${settingsStyles()}</style>
</head>
<body>
  <div class="head">
    <h1>Reader Settings</h1>
    <div class="tabs" role="tablist">
      ${TABS.map(
        (tab) =>
          `<button role="tab" class="tab${tab.surface === activeTab ? ' on' : ''}" data-tab="${tab.surface}" title="${tab.hint}">${tab.label}</button>`
      ).join('')}
    </div>
    <span class="spacer"></span>
    <button class="ghost" id="reset">Reset this tab</button>
  </div>

  ${renderMainTab(prefs.main, activeTab === 'main')}
  ${renderSideTab(prefs.side, activeTab === 'side')}

  <script>${settingsScript(prefs, activeTab)}</script>
</body>
</html>`;
}

/** Editor reader: a full-width preview on top, the controls below it. */
function renderMainTab(prefs: ReaderPrefs, active: boolean): string {
  return `<section class="tab-panel main" data-surface="main"${active ? '' : ' hidden'}>
    <div class="preview-label">Live Preview <span class="sub">(the editor-area reader)</span></div>
    <div class="preview main-preview">${previewBody()}</div>
    <div class="cards">${renderCards(prefs)}</div>
  </section>`;
}

/** Sidebar reader: controls on the left, a narrow preview you can resize on the right. */
function renderSideTab(prefs: ReaderPrefs, active: boolean): string {
  return `<section class="tab-panel side" data-surface="side"${active ? '' : ' hidden'}>
    <div class="side-layout">
      <div class="cards stacked">${renderCards(prefs)}</div>
      <div class="splitter" title="Drag to resize the preview"></div>
      <div class="side-preview-wrap">
        <div class="preview-label">Live Preview <span class="sub width"></span></div>
        <div class="preview side-preview">${previewBody()}</div>
      </div>
    </div>
  </section>`;
}

function previewBody(): string {
  return `<div class="cols"><h3>Chapter One</h3>${SAMPLE.map((line) => `<p>${line}</p>`).join('')}</div>`;
}

function renderCards(prefs: ReaderPrefs): string {
  return [...CARDS.map((card) => renderCard(card, prefs)), renderThemeCard(prefs)].join('\n');
}

function renderCard(card: Card, prefs: ReaderPrefs): string {
  return `<section class="card">
    <h2>${card.title}</h2>
    ${card.fields.map((field) => renderField(field, prefs)).join('\n')}
  </section>`;
}

function renderField(field: Field, prefs: ReaderPrefs): string {
  if (field.kind === 'segment') {
    const current = String(prefs[field.key]);
    const buttons = field.options
      .map(
        (opt) =>
          `<button data-key="${field.key}" data-value="${opt.value}" class="${opt.value === current ? 'on' : ''}">${opt.label}</button>`
      )
      .join('');
    return `<div class="field"><label>${field.label}</label><div class="segment">${buttons}</div></div>`;
  }

  if (field.kind === 'slider') {
    const value = Number(prefs[field.key]);
    return `<div class="field">
      <label>${field.label}<span class="value" data-for="${field.key}">${value}px</span></label>
      <input type="range" data-key="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}">
    </div>`;
  }

  const on = Boolean(prefs[field.key]);
  return `<div class="switch">
    <div class="text">
      <div class="name">${field.label}</div>
      <div class="hint">${field.hint}</div>
    </div>
    <button data-key="${field.key}" class="${on ? 'on' : ''}"></button>
  </div>`;
}

function renderThemeCard(prefs: ReaderPrefs): string {
  const swatches = PREBUILT_THEMES.map((theme) => {
    const active = theme.bg ? prefs.bgColor.toLowerCase() === theme.bg.toLowerCase() : !prefs.bgColor;
    const dot = theme.bg
      ? `background:${theme.bg}`
      : 'background:linear-gradient(135deg,var(--vscode-editor-background) 50%,var(--vscode-foreground) 50%)';
    return `<button data-bg="${theme.bg}" data-text="${theme.text}" class="${active ? 'on' : ''}">
      <span class="dot" style="${dot}"></span><span>${theme.name}</span>
    </button>`;
  }).join('\n');

  return `<section class="card">
    <h2>Reading Theme</h2>
    <div class="themes">${swatches}</div>
    <div class="colors">
      <label>Background <input type="color" data-color="bgColor" value="${prefs.bgColor || '#ffffff'}"></label>
      <label>Text <input type="color" data-color="textColor" value="${prefs.textColor || '#000000'}"></label>
    </div>
  </section>`;
}
