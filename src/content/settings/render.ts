import { PREBUILT_THEMES, type ReaderPrefs } from '../../epub/readerPrefs';
import { CARDS, type Card, type Field } from './fields';
import { settingsStyles } from './styles';
import { settingsScript } from './script';

const SAMPLE = [
  'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
  'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families.',
];

export function renderSettingsHtml(prefs: ReaderPrefs): string {
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
    <span class="sub">Applies live to the Now Reading panel</span>
    <button class="ghost" id="reset">Reset to defaults</button>
  </div>

  <div class="layout">
    <div class="cards">
      ${CARDS.map((card) => renderCard(card, prefs)).join('\n')}
      ${renderThemeCard(prefs)}
    </div>

    <div class="preview-wrap">
      <div class="preview-label">Live Preview</div>
      <div id="preview">
        <div class="cols">
          <h3>Chapter One</h3>
          ${SAMPLE.map((line) => `<p>${line}</p>`).join('\n')}
        </div>
      </div>
    </div>
  </div>

  <script>${settingsScript(prefs)}</script>
</body>
</html>`;
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
      <label>Background <input type="color" id="bgColor" value="${prefs.bgColor || '#ffffff'}"></label>
      <label>Text <input type="color" id="textColor" value="${prefs.textColor || '#000000'}"></label>
    </div>
  </section>`;
}
