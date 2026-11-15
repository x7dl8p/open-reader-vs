import type { ReaderPrefs, ReaderSurface } from '../../epub/readerPrefs';
import { THEME_SPEC } from '../readerTheme';

export function settingsScript(prefs: Record<ReaderSurface, ReaderPrefs>, activeTab: ReaderSurface): string {
  return `
const vscode = acquireVsCodeApi();
const SPEC = ${JSON.stringify(THEME_SPEC)};
const ALL = ${JSON.stringify(prefs)};
const state = Object.assign({ tab: ${JSON.stringify(activeTab)}, sideWidth: 320 }, vscode.getState() || {});

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

function saveState() { vscode.setState(state); }

// ---- Tabs ----
function showTab(surface) {
  state.tab = surface;
  saveState();
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === surface); });
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = p.dataset.surface !== surface; });
  if (surface === 'side' && window.applySideWidth) { window.applySideWidth(); }
  vscode.postMessage({ type: 'tab', surface: surface });
}
document.querySelectorAll('.tab').forEach(function (t) {
  t.addEventListener('click', function () { showTab(t.dataset.tab); });
});
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'tab') { showTab(e.data.surface); }
});

document.getElementById('reset').addEventListener('click', function () {
  vscode.postMessage({ type: 'reset', surface: state.tab });
});

// ---- One controller per tab; every selector is scoped to its panel ----
document.querySelectorAll('.tab-panel').forEach(function (panel) {
  const surface = panel.dataset.surface;
  const prefs = ALL[surface];
  const preview = panel.querySelector('.preview');

  function paint() {
    const vars = computeVars(prefs);
    for (const name in vars) { preview.style.setProperty(name, vars[name]); }
  }

  function set(patch) {
    Object.assign(prefs, patch);
    paint();
    vscode.postMessage({ type: 'set', surface: surface, patch: patch });
  }

  panel.querySelectorAll('.segment button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      const patch = {}; patch[btn.dataset.key] = btn.dataset.value;
      set(patch);
    });
  });

  panel.querySelectorAll('.switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const on = !btn.classList.contains('on');
      btn.classList.toggle('on', on);
      const patch = {}; patch[btn.dataset.key] = on;
      set(patch);
    });
  });

  panel.querySelectorAll('input[type=range]').forEach(function (slider) {
    slider.addEventListener('input', function () {
      const key = slider.dataset.key;
      panel.querySelector('.value[data-for=' + key + ']').textContent = slider.value + 'px';
      const patch = {}; patch[key] = Number(slider.value);
      set(patch);
    });
  });

  const bgInput = panel.querySelector('[data-color=bgColor]');
  const textInput = panel.querySelector('[data-color=textColor]');
  function selectTheme(bg, text, btn) {
    panel.querySelectorAll('.themes button').forEach(function (b) { b.classList.remove('on'); });
    if (btn) { btn.classList.add('on'); }
    bgInput.value = bg || '#ffffff';
    textInput.value = text || '#000000';
    set({ bgColor: bg, textColor: text });
  }
  panel.querySelectorAll('.themes button').forEach(function (btn) {
    btn.addEventListener('click', function () { selectTheme(btn.dataset.bg || '', btn.dataset.text || '', btn); });
  });
  [bgInput, textInput].forEach(function (input) {
    input.addEventListener('input', function () { selectTheme(bgInput.value, textInput.value, null); });
  });

  paint();
});

// ---- Side tab: drag the splitter to try the sidebar at different widths ----
(function () {
  const layout = document.querySelector('.side-layout');
  const splitter = layout.querySelector('.splitter');
  const label = layout.querySelector('.width');
  function apply(width) {
    if (layout.clientWidth === 0) { layout.style.setProperty('--side-width', width + 'px'); return; }
    const max = Math.max(220, layout.clientWidth - 300);
    state.sideWidth = Math.round(Math.min(Math.max(width, 200), max));
    layout.style.setProperty('--side-width', state.sideWidth + 'px');
    label.textContent = '(sidebar at ' + state.sideWidth + 'px)';
  }
  apply(state.sideWidth);
  // Hidden tabs measure 0px wide, so the width is applied again whenever the tab shows.
  window.applySideWidth = function () { apply(state.sideWidth); };
  splitter.addEventListener('pointerdown', function (e) {
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('dragging');
    const right = layout.getBoundingClientRect().right;
    function move(ev) { apply(right - ev.clientX); }
    function up() {
      splitter.classList.remove('dragging');
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      saveState();
    }
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });
  window.addEventListener('resize', function () { apply(state.sideWidth); });
})();

showTab(state.tab);
`;
}
