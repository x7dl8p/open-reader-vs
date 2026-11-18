// VS Code test harness: launches a clean VS Code with the extension under development and
// exposes a tiny HTTP API so steps can be driven one at a time:
//   POST /eval  body = async JS (has: app, page, frame(sel), shot(name), cmd(title), sleep(ms))
const http = require('http');
const path = require('path');
const fs = require('fs');
const { _electron } = require('playwright-core');

const H = __dirname;
// Default: the repo root two levels up.
const EXT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const WS = path.join(H, 'workspace');
const SHOTS = path.join(H, 'shots');
fs.mkdirSync(WS, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
// VSCODE_VERSION=1.107.0 picks that build (download it first); otherwise the newest one.
const builds = fs.readdirSync(path.join(H, '.vscode-test')).filter((d) => d.startsWith('vscode-linux'))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const build = builds.find((d) => process.env.VSCODE_VERSION && d.endsWith(process.env.VSCODE_VERSION)) || builds[0];
// VSCODE_EXE points at another editor build entirely, e.g. a fork installed on this machine.
const exe = process.env.VSCODE_EXE || path.join(H, '.vscode-test', build, 'code');
console.log('Using ' + build);

(async () => {
  const userData = path.join(H, process.env.PROFILE || 'user-data');
  fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'User', 'settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false,
    'window.titleBarStyle': 'custom', 'window.dialogStyle': 'custom', 'window.menuStyle': 'custom', 'update.mode': 'none', 'telemetry.telemetryLevel': 'off',
    'workbench.colorTheme': process.env.THEME || 'Default Dark Modern', 'chat.disableAIFeatures': true,
    'workbench.secondarySideBar.defaultVisibility': 'hidden', 'window.zoomLevel': 0,
  }, null, 2));
  const app = await _electron.launch({
    executablePath: exe,
    args: [
      '--extensionDevelopmentPath=' + EXT, '--user-data-dir=' + userData,
      '--extensions-dir=' + path.join(H, 'extensions'), '--disable-workspace-trust',
      '--skip-release-notes', '--skip-welcome', '--disable-gpu', '--no-sandbox', '--new-window',
      ...(process.env.HEADED ? [] : ['--ozone-platform=headless']), WS,
    ],
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_RUN_AS_NODE|VSCODE_)/.test(k))),
    timeout: 90000,
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 920 }).catch(() => {});
  await page.waitForSelector('.monaco-workbench', { timeout: 90000 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name, target) => {
    const file = path.join(SHOTS, name + '.png');
    await (target || page).screenshot({ path: file });
    return file;
  };
  /** First frame (any depth, e.g. inside a webview) containing `sel`. */
  const frame = async (sel, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      for (const f of page.frames()) {
        try { if (await f.$(sel)) { return f; } } catch {}
      }
      await sleep(250);
    }
    throw new Error('no frame with ' + sel);
  };
  const cmd = async (title) => {
    await page.keyboard.press('F1');
    await page.waitForSelector('.quick-input-widget input', { state: 'visible' });
    await page.keyboard.type(title);
    await sleep(600);
    await page.keyboard.press('Enter');
    await sleep(800);
  };
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  const server = http.createServer(async (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const fn = new Function('ctx', `return (async ({app,page,frame,shot,cmd,sleep,logs}) => { ${body} })(ctx)`);
        const out = await fn({ app, page, frame, shot, cmd, sleep, logs });
        res.end(JSON.stringify(out === undefined ? 'ok' : out, null, 1));
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e && e.stack || e));
      }
    });
  });
  server.listen(7777, '127.0.0.1', () => console.log('HARNESS READY on 7777'));
  app.on('close', () => { console.log('VS Code closed'); process.exit(0); });
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
