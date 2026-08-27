export function settingsStyles(): string {
  return `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 0 64px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

.head {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: baseline; gap: 16px;
  padding: 22px 32px 16px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
}
.head h1 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.head .sub { flex: 1; opacity: .6; font-size: 12px; }

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  padding: 24px 32px 0;
  align-items: start;
}
@media (min-width: 1080px) {
  .layout { grid-template-columns: minmax(0, 1fr) minmax(340px, 420px); }
}

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }

.card {
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
  border-radius: 10px;
  padding: 16px 18px 18px;
  background: var(--vscode-editorWidget-background, transparent);
}
.card h2 {
  margin: 0 0 14px;
  font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  opacity: .55;
}

.field { margin-bottom: 15px; }
.field:last-child { margin-bottom: 0; }
.field > label {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 7px; font-size: 12px; font-weight: 500;
}
.field .value { opacity: .6; font-variant-numeric: tabular-nums; font-size: 11px; }

.segment { display: flex; gap: 3px; padding: 3px; border-radius: 8px; background: var(--vscode-input-background, rgba(128,128,128,.1)); }
.segment button {
  flex: 1; min-width: 0;
  border: none; border-radius: 6px; padding: 6px 8px;
  background: none; color: var(--vscode-foreground); cursor: pointer;
  font-family: inherit; font-size: 11.5px; font-weight: 500;
  transition: background .12s ease, color .12s ease;
}
.segment button:hover:not(.on) { background: var(--vscode-toolbar-hoverBackground); }
.segment button.on {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-weight: 600;
}

input[type=range] {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 4px; border-radius: 999px; cursor: pointer;
  background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,.35));
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--vscode-button-background);
  border: 2px solid var(--vscode-editor-background);
  cursor: pointer;
}

.switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.switch:last-child { margin-bottom: 0; }
.switch .text { min-width: 0; }
.switch .name { font-size: 12px; font-weight: 500; }
.switch .hint { font-size: 10.5px; opacity: .55; margin-top: 2px; }
.switch button {
  flex-shrink: 0; width: 38px; height: 21px; padding: 0;
  border: none; border-radius: 999px; cursor: pointer; position: relative;
  background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,.35));
  transition: background .15s ease;
}
.switch button.on { background: var(--vscode-button-background); }
.switch button::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--vscode-editor-background);
  transition: transform .15s ease;
}
.switch button.on::after { transform: translateX(17px); }

.themes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 7px; }
.themes button {
  display: flex; align-items: center; gap: 8px; text-align: left;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.28));
  border-radius: 8px; padding: 8px 10px; cursor: pointer;
  background: none; color: var(--vscode-foreground);
  font-family: inherit; font-size: 11.5px;
}
.themes button:hover { background: var(--vscode-toolbar-hoverBackground); }
.themes button.on { border-color: var(--vscode-button-background); border-width: 2px; padding: 7px 9px; }
.dot { width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(128,128,128,.45); }

.colors { display: flex; gap: 22px; margin-top: 14px; }
.colors label { display: flex; align-items: center; gap: 9px; font-size: 12px; }
input[type=color] {
  width: 30px; height: 30px; padding: 0; cursor: pointer;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
  border-radius: 7px; background: none;
}

.preview-wrap { position: sticky; top: 84px; }
.preview-label {
  font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  opacity: .55; margin-bottom: 9px;
}
#preview {
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
  border-radius: 10px;
  overflow: hidden;
  max-height: 62vh; overflow-y: auto;
  background: var(--reader-bg);
  color: var(--reader-fg);
  font-family: var(--reader-font);
  font-size: var(--reader-size);
  font-weight: var(--reader-weight);
  line-height: var(--reader-leading);
  letter-spacing: var(--reader-tracking);
  text-align: var(--reader-align);
  padding: var(--reader-margin-y) var(--reader-margin-x);
}
#preview .cols { column-width: var(--reader-columns); column-gap: 2rem; }
#preview h3 { margin: 0 0 .6em; font-size: 1.15em; font-weight: 600; text-indent: 0; }
#preview p { text-indent: var(--reader-indent); margin: var(--reader-para-margin); }

button.ghost {
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
  border-radius: 6px; padding: 5px 12px; cursor: pointer;
  background: none; color: var(--vscode-foreground);
  font-family: inherit; font-size: 11.5px;
}
button.ghost:hover { background: var(--vscode-toolbar-hoverBackground); }
`;
}
