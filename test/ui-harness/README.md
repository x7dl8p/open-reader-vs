# UI harness

Launches a clean VS Code (its own profile, headless) with this extension under development,
and keeps it running behind a small local HTTP API, so the UI can be driven step by step:
clicks, typing, commands and screenshots, including inside webviews.

```sh
cd test/ui-harness
npm install && npm run setup      # once: installs Playwright core, downloads VS Code
pnpm --dir ../.. run compile      # build the extension first
npm start                         # waits for "HARNESS READY on 7777"
./run "await cmd('Reader: Browse Sources'); return await shot('browse')"
```

Each step is the body of an async function with these in scope:

| name | what |
| --- | --- |
| `page` | the VS Code window (Playwright `Page`) |
| `frame(selector)` | the first frame, at any depth (webviews too), containing `selector` |
| `cmd(title)` | run a command from the palette, e.g. `cmd('Reader: Settings')` |
| `shot(name)` | screenshot to `shots/<name>.png`, returns the path |
| `sleep(ms)`, `app`, `logs` | delay, the Electron app, console lines |

Notes:
- `HEADED=1 npm start` shows the window instead of running headless.
- The profile's `settings.json` is reset at every start; reload the window
  (`cmd('Developer: Reload Window')`) to test persistence instead of restarting.
- Dialogs and context menus use `window.dialogStyle`/`window.menuStyle: custom`, since native ones cannot open headless.
- Run from inside VS Code, the inherited `ELECTRON_RUN_AS_NODE`/`VSCODE_*` variables are
  stripped, otherwise the downloaded VS Code starts as plain Node.
