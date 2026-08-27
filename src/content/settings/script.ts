import type { ReaderPrefs } from '../../epub/readerPrefs';
import { THEME_SPEC } from '../readerTheme';

export function settingsScript(prefs: ReaderPrefs): string {
  return `
const vscode = acquireVsCodeApi();
const SPEC = ${JSON.stringify(THEME_SPEC)};
const prefs = ${JSON.stringify(prefs)};
const preview = document.getElementById('preview');

function computeVars(p) {
  const vars = {};
  for (const key in SPEC.lookup) {
    const entry = SPEC.lookup[key];
    vars[entry[0]] = String(entry[1][p[key]]);
  }
  for (const key in SPEC.direct) { vars[SPEC.direct[key]] = String(p[key]); }
  for (const key in SPEC.px) { vars[SPEC.px[key]] = p[key] + 'px'; }
  for (const key in SPEC.bool) {
    const pair = SPEC.bool[key];
    Object.assign(vars, p[key] ? pair.on : pair.off);
  }
  for (const key in SPEC.color) {
    const entry = SPEC.color[key];
    vars[entry[0]] = p[key] || entry[1];
  }
  return vars;
}

function paint() {
  const vars = computeVars(prefs);
  for (const name in vars) { preview.style.setProperty(name, vars[name]); }
}

function set(key, value) {
  prefs[key] = value;
  paint();
  vscode.postMessage({ type: 'set', key: key, value: value });
}

document.querySelectorAll('.segment button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const key = btn.dataset.key;
    btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    btn.classList.add('on');
    set(key, btn.dataset.value);
  });
});

document.querySelectorAll('.switch button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    set(btn.dataset.key, on);
  });
});

document.querySelectorAll('input[type=range]').forEach(function (slider) {
  slider.addEventListener('input', function () {
    const key = slider.dataset.key;
    document.querySelector('.value[data-for=' + key + ']').textContent = slider.value + 'px';
    set(key, Number(slider.value));
  });
});

function selectTheme(bg, text, btn) {
  document.querySelectorAll('.themes button').forEach(function (b) { b.classList.remove('on'); });
  if (btn) { btn.classList.add('on'); }
  document.getElementById('bgColor').value = bg || '#ffffff';
  document.getElementById('textColor').value = text || '#000000';
  prefs.bgColor = bg;
  prefs.textColor = text;
  paint();
  vscode.postMessage({ type: 'setColors', bgColor: bg, textColor: text });
}

document.querySelectorAll('.themes button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    selectTheme(btn.dataset.bg || '', btn.dataset.text || '', btn);
  });
});

['bgColor', 'textColor'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', function (e) {
    document.querySelectorAll('.themes button').forEach(function (b) { b.classList.remove('on'); });
    selectTheme(document.getElementById('bgColor').value, document.getElementById('textColor').value, null);
  });
});

document.getElementById('reset').addEventListener('click', function () {
  vscode.postMessage({ type: 'reset' });
});

paint();
`;
}
