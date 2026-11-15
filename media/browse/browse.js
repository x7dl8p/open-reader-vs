// @ts-check
// Browse Sources, the webview side. Laid out like VS Code's Extensions view: a source
// list on the left, the selected source (then a novel) in the editor area on the right.
// Every source call is a request to the extension host; nothing here touches the network
// except plain <img> loads.
(function () {
  'use strict';

  /** @type {any} */
  const vscode = acquireVsCodeApi();
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));

  // ---------------------------------------------------------------- RPC
  let nextId = 1;
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  const pending = new Map();
  /** @returns {Promise<any>} */
  function call(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      vscode.postMessage({ id, method, params: params || {} });
    });
  }
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'response') {
      const waiter = pending.get(msg.id);
      if (!waiter) { return; }
      pending.delete(msg.id);
      if (msg.error) { waiter.reject(new Error(msg.error)); } else { waiter.resolve(msg.result); }
    } else if (msg.type === 'changed') {
      void loadCatalog(false);
      if (state.view.kind === 'novel') { void openNovel(state.view.sourceId, state.view.path, false, true); }
    } else if (msg.type === 'state') {
      if (novelCtl && novelCtl.filePath === msg.filePath) { novelCtl.reloadState(); }
    } else if (msg.type === 'download') {
      if (novelCtl && novelCtl.filePath === msg.status.filePath) { novelCtl.onDownload(msg.status); }
    } else if (msg.type === 'focus') {
      if (msg.sourceId && msg.novelPath) { void openNovel(msg.sourceId, msg.novelPath, true); }
      else if (msg.sourceId) { selectSource(msg.sourceId); }
    }
  });

  // ---------------------------------------------------------------- state
  const saved = vscode.getState() || {};
  const state = {
    sidebarWidth: saved.sidebarWidth || 320,
    query: saved.query || '',
    lang: saved.lang || '',
    collapsed: saved.collapsed || {},
    /** @type {any} */
    view: saved.view || { kind: 'welcome' },
    /** @type {any[]} */
    catalog: [],
    /** @type {any[]} */
    installed: [],
    /** @type {string[]} */
    updates: [],
    catalogError: '',
    loadingCatalog: true,
  };
  function persist() {
    vscode.setState({
      sidebarWidth: state.sidebarWidth, query: state.query, lang: state.lang,
      collapsed: state.collapsed, view: state.view,
    });
  }

  // ---------------------------------------------------------------- DOM helpers
  /**
   * @param {string} tag
   * @param {Record<string, any>=} attrs
   * @param {...any} children
   * @returns {HTMLElement}
   */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) { continue; }
      if (key === 'class') { el.className = value; }
      else if (key === 'dataset') { Object.assign(el.dataset, value); }
      else if (key.startsWith('on') && typeof value === 'function') { el.addEventListener(key.slice(2), value); }
      else { el.setAttribute(key, value === true ? '' : String(value)); }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) { continue; }
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }
  const icon = (name, extra) => h('i', { class: `codicon codicon-${name}${extra ? ' ' + extra : ''}`, 'aria-hidden': 'true' });
  /** Sources give release times as ISO stamps or free text; show dates, pass text through. */
  function formatTime(value) {
    const d = /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? new Date(value) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : String(value);
  }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; } }
  function button(label, opts) {
    opts = opts || {};
    return h('button', {
      class: `btn ${opts.kind || 'primary'}${opts.small ? ' small' : ''}`,
      title: opts.title, disabled: opts.disabled, onclick: opts.onclick,
    }, opts.icon ? icon(opts.icon) : null, label ? h('span', {}, label) : null);
  }
  function iconButton(name, title, onclick) {
    return h('button', { class: 'icon-btn', title, 'aria-label': title, onclick }, icon(name));
  }
  function spinner(text) { return h('div', { class: 'loading' }, icon('loading', 'codicon-modifier-spin'), h('span', {}, text || 'Loading…')); }
  function errorBox(message, retry) {
    return h('div', { class: 'error-box' }, icon('warning'), h('div', { class: 'msg' }, message),
      retry ? button('Retry', { kind: 'secondary', small: true, onclick: retry }) : null);
  }
  /** A cover/icon image that falls back to the extension-host proxy, then a placeholder. */
  function img(src, sourceId, cls, alt) {
    const el = h('img', { class: cls, alt: alt || '', loading: 'lazy', referrerpolicy: 'no-referrer', dataset: { sourceId: sourceId || '' } });
    if (src) { el.setAttribute('src', src); } else { el.classList.add('broken'); }
    return el;
  }
  document.addEventListener('error', (event) => {
    const el = /** @type {HTMLImageElement} */ (event.target);
    if (!(el instanceof HTMLImageElement)) { return; }
    if (el.dataset.proxied || !/^https?:/.test(el.src)) { el.classList.add('broken'); return; }
    el.dataset.proxied = '1';
    call('image', { sourceId: el.dataset.sourceId, url: el.src })
      .then((r) => { el.src = r.dataUrl; })
      .catch(() => { el.classList.add('broken'); });
  }, true);
  function toast(text, kind) {
    const t = h('div', { class: `toast ${kind || ''}` }, icon(kind === 'error' ? 'error' : 'check'), h('span', {}, text));
    document.body.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ---------------------------------------------------------------- shell
  const sidebar = h('aside', { class: 'sidebar' });
  const sash = h('div', { class: 'sash', title: 'Drag to resize' });
  const editor = h('main', { class: 'editor' });
  app.append(sidebar, sash, editor);
  app.style.setProperty('--sidebar-width', state.sidebarWidth + 'px');

  sash.addEventListener('pointerdown', (e) => {
    sash.setPointerCapture(e.pointerId);
    sash.classList.add('active');
    const move = (ev) => {
      state.sidebarWidth = Math.round(Math.min(Math.max(ev.clientX, 220), Math.max(260, window.innerWidth - 360)));
      app.style.setProperty('--sidebar-width', state.sidebarWidth + 'px');
    };
    const up = () => {
      sash.classList.remove('active');
      sash.removeEventListener('pointermove', move);
      sash.removeEventListener('pointerup', up);
      persist();
    };
    sash.addEventListener('pointermove', move);
    sash.addEventListener('pointerup', up);
  });

  // ---------------------------------------------------------------- sidebar
  const searchInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text', class: 'search', placeholder: 'Search Sources', value: state.query, spellcheck: 'false',
    oninput: () => { state.query = searchInput.value; persist(); renderList(); },
  }));
  const langSelect = /** @type {HTMLSelectElement} */ (h('select', {
    class: 'lang', title: 'Language',
    onchange: () => { state.lang = langSelect.value; persist(); renderList(); },
  }));
  const listEl = h('div', { class: 'list', role: 'list' });

  sidebar.append(
    h('div', { class: 'pane-title' },
      h('span', { class: 'title' }, 'Sources'),
      h('div', { class: 'actions' },
        iconButton('link', 'Import from Link', () => showImport()),
        iconButton('refresh', 'Refresh Repositories', () => loadCatalog(true)),
        iconButton('settings-gear', 'Manage Repositories', () => call('repositories')))),
    h('div', { class: 'search-row' },
      h('div', { class: 'search-box' }, icon('search'), searchInput),
      langSelect),
    listEl);

  function filteredCatalog() {
    const q = state.query.trim().toLowerCase();
    return state.catalog.filter((item) =>
      (!state.lang || item.lang === state.lang) &&
      (!q || item.name.toLowerCase().includes(q) || hostOf(item.site).includes(q) || item.id.toLowerCase().includes(q)));
  }

  function renderList() {
    listEl.replaceChildren();
    if (state.loadingCatalog && state.catalog.length === 0) { listEl.append(spinner('Loading repositories…')); return; }
    if (state.catalogError && state.catalog.length === 0) { listEl.append(errorBox(state.catalogError, () => loadCatalog(true))); return; }

    const installedIds = new Set(state.installed.map((i) => i.id));
    const visible = filteredCatalog();
    const byId = new Map(state.catalog.map((i) => [i.id, i]));
    // Installed sources stay listed even if their repository dropped them.
    const installedItems = state.installed
      .map((i) => byId.get(i.id) || i)
      .filter((item) => visible.includes(item) || (!byId.has(item.id) && matches(item)));
    const available = visible.filter((i) => !installedIds.has(i.id));

    listEl.append(section('installed', 'Installed', installedItems, true));
    listEl.append(section('available', 'Available', available, false));
  }
  function matches(item) {
    const q = state.query.trim().toLowerCase();
    return (!state.lang || item.lang === state.lang) && (!q || item.name.toLowerCase().includes(q));
  }

  const PAGE = 120;
  function section(key, title, items, installed) {
    const collapsed = !!state.collapsed[key];
    const body = h('div', { class: 'section-body' });
    const header = h('div', {
      class: `section-header${collapsed ? ' collapsed' : ''}`, role: 'button', tabindex: '0',
      onclick: () => { state.collapsed[key] = !collapsed; persist(); renderList(); },
    }, icon(collapsed ? 'chevron-right' : 'chevron-down'), h('span', { class: 'label' }, title), h('span', { class: 'badge' }, String(items.length)));

    if (!collapsed) {
      if (items.length === 0) {
        body.append(h('div', { class: 'empty' }, installed
          ? (state.query ? 'No installed source matches.' : 'No sources installed yet. Install one from the list below.')
          : 'No sources match.'));
      }
      let shown = 0;
      const more = () => {
        const slice = items.slice(shown, shown + PAGE);
        shown += slice.length;
        for (const item of slice) { body.append(row(item, installed)); }
        moreBtn.remove();
        if (shown < items.length) { body.append(moreBtn); }
      };
      const moreBtn = h('button', { class: 'link-btn more', onclick: more }, `Show ${Math.min(PAGE, items.length - PAGE)} more…`);
      more();
    }
    return h('div', { class: 'section' }, header, body);
  }

  function row(item, installed) {
    const selected = state.view.sourceId === item.id;
    const hasUpdate = state.updates.includes(item.id);
    const action = installed
      ? (hasUpdate ? button('Update', { small: true, onclick: (e) => { e.stopPropagation(); install(item.id, e.currentTarget); } }) :
        h('button', { class: 'icon-btn manage', title: 'Uninstall', onclick: (e) => { e.stopPropagation(); uninstall(item); } }, icon('trash')))
      : button('Install', { small: true, onclick: (e) => { e.stopPropagation(); install(item.id, e.currentTarget); } });

    return h('div', {
      class: `row${selected ? ' selected' : ''}`, role: 'listitem', tabindex: '0', dataset: { id: item.id },
      onclick: () => selectSource(item.id),
      onkeydown: (e) => { if (e.key === 'Enter') { selectSource(item.id); } },
    },
    img(item.iconUrl, item.id, 'row-icon'),
    h('div', { class: 'row-details' },
      h('div', { class: 'row-header' },
        h('span', { class: 'name' }, item.name),
        h('span', { class: 'version' }, 'v' + item.version)),
      h('div', { class: 'description' }, hostOf(item.site)),
      h('div', { class: 'row-footer' },
        h('span', { class: 'publisher' }, icon('globe'), h('span', {}, item.lang.replace(/^‎/, ''))),
        h('span', { class: 'row-actions' }, action))));
  }

  async function loadCatalog(force) {
    state.loadingCatalog = true;
    if (force) { state.catalogError = ''; renderList(); }
    try {
      const result = await call('catalog', { force });
      state.catalog = result.items;
      state.installed = result.installed;
      state.updates = result.updates;
      state.catalogError = '';
      fillLanguages();
    } catch (err) {
      state.catalogError = err.message;
    } finally {
      state.loadingCatalog = false;
      renderList();
      if (state.view.kind === 'source') {
        // A restored page rendered before the installed list was known.
        if (!browse && state.installed.some((i) => i.id === state.view.sourceId)) { renderSource(); } else { renderSourceHeaderOnly(); }
      }
    }
  }

  function fillLanguages() {
    const counts = new Map();
    for (const item of state.catalog) { counts.set(item.lang, (counts.get(item.lang) || 0) + 1); }
    const langs = [...counts.keys()].sort((a, b) => a.replace(/^‎/, '').localeCompare(b.replace(/^‎/, '')));
    langSelect.replaceChildren(h('option', { value: '' }, `All languages`),
      ...langs.map((l) => h('option', { value: l, selected: l === state.lang }, `${l.replace(/^‎/, '')} (${counts.get(l)})`)));
    langSelect.value = state.lang;
  }

  async function install(id, btn) {
    if (btn) { btn.disabled = true; btn.replaceChildren(icon('loading', 'codicon-modifier-spin'), h('span', {}, 'Installing')); }
    try {
      const r = await call('install', { sourceId: id });
      state.installed = r.installed;
      state.updates = state.updates.filter((u) => u !== id);
      const item = state.catalog.find((i) => i.id === id);
      toast(`Installed ${item ? item.name : id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    renderList();
    if (state.view.sourceId === id) { selectSource(id, true); }
  }

  async function uninstall(item) {
    try {
      const r = await call('uninstall', { sourceId: item.id });
      state.installed = r.installed;
      toast(`Uninstalled ${item.name}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    renderList();
    if (state.view.sourceId === item.id) { selectSource(item.id, true); }
  }

  // ---------------------------------------------------------------- editor: welcome / import
  function showWelcome() {
    state.view = { kind: 'welcome' };
    persist();
    renderList();
    editor.replaceChildren(h('div', { class: 'welcome' },
      icon('book', 'hero'),
      h('h1', {}, 'Browse Sources'),
      h('p', { class: 'muted' }, 'Read web novels from LNReader sources. Pick a source on the left and install it to browse its catalog. Novels you add to the library appear in the Open-Reader sidebar.'),
      importCard()));
  }

  function showImport() {
    showWelcome();
    const input = editor.querySelector('input.import-url');
    if (input) { /** @type {HTMLInputElement} */ (input).focus(); }
  }

  function importCard() {
    const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'import-url', placeholder: 'https://… a novel page or an .epub/.cbz link', spellcheck: 'false' }));
    const status = h('div', { class: 'import-status' });
    const go = async () => {
      const url = input.value.trim();
      if (!url) { input.focus(); return; }
      status.replaceChildren(spinner('Importing…'));
      try {
        const r = await call('importLink', { url });
        if (!r) { status.replaceChildren(); return; }
        status.replaceChildren(h('div', { class: 'ok' }, icon('check'), ` Added “${r.title}” to the library.`));
        input.value = '';
        if (r.kind === 'novel' && r.sourceId) { void openNovel(r.sourceId, r.path, true); }
      } catch (err) {
        status.replaceChildren(errorBox(err.message));
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { void go(); } });
    return h('div', { class: 'import-card' },
      h('div', { class: 'card-title' }, icon('link'), ' Import from Link'),
      h('p', { class: 'muted small' }, 'Paste a novel’s page from any site a source serves (the matching source is installed if needed), or a direct link to an EPUB or CBZ file.'),
      h('div', { class: 'import-row' }, input, button('Import', { onclick: go })),
      status);
  }

  // ---------------------------------------------------------------- editor: source page
  /** @type {{sourceId: string, mode: string, page: number, query: string, items: any[], done: boolean, loading: boolean, filters: any, filterDefs: any, token: number} | null} */
  let browse = null;
  let browseToken = 0;
  let sourceHeaderEl = null;

  function selectSource(id, force) {
    if (!force && state.view.kind === 'source' && state.view.sourceId === id) { return; }
    const keep = state.view.kind === 'source' && state.view.sourceId === id ? state.view : null;
    state.view = { kind: 'source', sourceId: id, mode: (keep && keep.mode) || 'popular', query: (keep && keep.query) || '', filters: keep && keep.filters };
    persist();
    renderList();
    renderSource();
  }

  function sourceItem(id) {
    return state.catalog.find((i) => i.id === id) || state.installed.find((i) => i.id === id);
  }

  function renderSourceHeaderOnly() {
    if (sourceHeaderEl && state.view.kind === 'source') {
      const fresh = sourceHeader(state.view.sourceId);
      sourceHeaderEl.replaceWith(fresh);
      sourceHeaderEl = fresh;
    }
  }

  function sourceHeader(id) {
    const item = sourceItem(id);
    if (!item) { return h('div', { class: 'details-header' }, spinner()); }
    const installed = state.installed.some((i) => i.id === id);
    const hasUpdate = state.updates.includes(id);
    return h('div', { class: 'details-header' },
      img(item.iconUrl, item.id, 'details-icon'),
      h('div', { class: 'details' },
        h('div', { class: 'title-row' },
          h('h1', { class: 'name' }, item.name),
          h('span', { class: 'pill' }, 'v' + item.version)),
        h('div', { class: 'subtitle' },
          h('a', { class: 'link', href: '#', onclick: (e) => { e.preventDefault(); call('openExternal', { url: item.site }); } }, icon('link-external'), ' ', hostOf(item.site)),
          h('span', { class: 'sep' }, '|'),
          h('span', {}, icon('globe'), ' ', item.lang.replace(/^‎/, '')),
          h('span', { class: 'sep' }, '|'),
          h('span', { class: 'muted' }, item.id)),
        h('div', { class: 'description' }, installed
          ? 'Browse popular and latest novels, search, or filter. Open a novel to see its chapters and add it to your library.'
          : 'Install this source to browse its novels. Sources are LNReader plugins and run inside VS Code.'),
        h('div', { class: 'actions' },
          installed
            ? [hasUpdate ? button('Update', { onclick: (e) => install(id, e.currentTarget) }) : null,
              button('Uninstall', { kind: 'secondary', onclick: () => uninstall(item) })]
            : button('Install', { onclick: (e) => install(id, e.currentTarget) }))));
  }

  function renderSource() {
    const id = state.view.sourceId;
    const installed = state.installed.some((i) => i.id === id);
    sourceHeaderEl = sourceHeader(id);
    const body = h('div', { class: 'source-body' });
    editor.replaceChildren(h('div', { class: 'page' }, sourceHeaderEl, body));
    editor.scrollTop = 0;

    if (!installed) {
      body.append(h('div', { class: 'not-installed' }, icon('cloud-download', 'hero small'),
        h('p', {}, 'This source is not installed.')));
      browse = null;
      return;
    }

    const token = ++browseToken;
    browse = { sourceId: id, mode: state.view.mode, page: 0, query: state.view.query || '', items: [], done: false, loading: false, filters: state.view.mode === 'popular' ? (state.view.filters || null) : null, filterDefs: null, token };

    const searchField = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text', class: 'search inline', placeholder: 'Search this source', value: browse.query, spellcheck: 'false',
      onkeydown: (e) => { if (e.key === 'Enter') { setMode('search', searchField.value.trim()); } },
    }));
    const tabs = h('div', { class: 'nav-tabs' },
      ...[['popular', 'Popular'], ['latest', 'Latest']].map(([mode, label]) =>
        h('button', { class: `nav-tab${browse && browse.mode === mode ? ' active' : ''}`, onclick: () => setMode(mode, '') }, label)),
      h('button', { class: `nav-tab${browse.mode === 'search' ? ' active' : ''}`, onclick: () => { searchField.focus(); if (searchField.value.trim()) { setMode('search', searchField.value.trim()); } } }, 'Search'),
      h('span', { class: 'spacer' }),
      h('div', { class: 'search-box small' }, icon('search'), searchField),
      h('button', { class: 'icon-btn filter-btn', title: 'Filters', onclick: () => toggleFilters() }, icon('filter')));
    const filterPanel = h('div', { class: 'filter-panel', hidden: true });
    const grid = h('div', { class: 'grid' });
    const footer = h('div', { class: 'grid-footer' });
    body.append(tabs, filterPanel, grid, footer);

    call('sourceInfo', { sourceId: id }).then((info) => {
      if (!browse || browse.token !== token) { return; }
      browse.filterDefs = info.filters;
      const btn = tabs.querySelector('.filter-btn');
      if (btn && Object.keys(info.filters || {}).length === 0) { btn.setAttribute('hidden', ''); }
      if (btn && browse.filters) { btn.classList.add('active'); }
    }).catch(() => {});

    function setMode(mode, query) {
      state.view.mode = mode;
      state.view.query = query;
      persist();
      renderSource();
    }

    function toggleFilters() {
      if (!browse || !browse.filterDefs) { return; }
      if (!filterPanel.hidden) { filterPanel.hidden = true; return; }
      filterPanel.replaceChildren(filterForm(browse.filterDefs, browse.filters, (values) => {
        state.view.mode = 'popular';
        state.view.query = '';
        state.view.filters = values;
        persist();
        renderSource();
      }));
      filterPanel.hidden = false;
    }

    async function loadMore() {
      const b = browse;
      if (!b || b.loading || b.done || b.token !== token) { return; }
      if (b.mode === 'search' && !b.query) {
        footer.replaceChildren(h('div', { class: 'muted center' }, 'Type a title and press Enter to search.'));
        b.done = true;
        return;
      }
      b.loading = true;
      footer.replaceChildren(spinner(b.page === 0 ? 'Loading novels…' : 'Loading more…'));
      try {
        const r = await call('browse', { sourceId: b.sourceId, mode: b.mode, page: b.page + 1, query: b.query, filters: b.filters || undefined });
        if (b.token !== browseToken) { return; }
        b.page += 1;
        const seen = new Set(b.items.map((n) => n.path));
        const fresh = r.items.filter((n) => n.path && !seen.has(n.path));
        b.items.push(...fresh);
        for (const novel of fresh) { grid.append(card(b.sourceId, novel)); }
        if (fresh.length === 0) { b.done = true; }
        footer.replaceChildren(b.done
          ? h('div', { class: 'muted center' }, b.items.length ? `${b.items.length} novels` : (b.mode === 'search' ? `No results for “${b.query}”.` : 'No novels.'))
          : '');
      } catch (err) {
        footer.replaceChildren(errorBox(err.message, () => { footer.replaceChildren(); void loadMore(); }));
        b.done = true;
      } finally {
        b.loading = false;
      }
      // Fill a tall window without waiting for a scroll event.
      requestAnimationFrame(() => { if (!b.done && editor.scrollHeight <= editor.clientHeight + 200) { void loadMore(); } });
    }

    editor.onscroll = () => {
      if (editor.scrollTop + editor.clientHeight > editor.scrollHeight - 600) { void loadMore(); }
    };
    void loadMore();
  }

  function card(sourceId, novel) {
    return h('div', { class: 'card', tabindex: '0', title: novel.name,
      onclick: () => openNovel(sourceId, novel.path, true),
      onkeydown: (e) => { if (e.key === 'Enter') { void openNovel(sourceId, novel.path, true); } } },
    h('div', { class: 'cover-wrap' }, img(novel.cover, sourceId, 'cover', novel.name)),
    h('div', { class: 'card-title' }, novel.name));
  }

  /** A form for an LNReader plugin's filter definitions. */
  function filterForm(defs, current, apply) {
    const values = {};
    const form = h('div', { class: 'filters' });
    for (const [key, def] of Object.entries(defs)) {
      const cur = current && current[key] ? current[key].value : def.value;
      values[key] = { type: def.type, value: JSON.parse(JSON.stringify(cur === undefined ? null : cur)) };
      const field = h('div', { class: 'filter' }, h('label', {}, def.label));
      if (def.type === 'Picker') {
        const sel = /** @type {HTMLSelectElement} */ (h('select', { onchange: () => { values[key].value = sel.value; } },
          ...(def.options || []).map((o) => h('option', { value: o.value, selected: o.value === cur }, o.label))));
        field.append(sel);
      } else if (def.type === 'Text') {
        const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: cur || '', oninput: () => { values[key].value = input.value; } }));
        field.append(input);
      } else if (def.type === 'Switch') {
        const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !!cur, onchange: () => { values[key].value = cb.checked; } }));
        field.classList.add('inline');
        field.prepend(cb);
      } else if (def.type === 'Checkbox') {
        const set = new Set(Array.isArray(cur) ? cur : []);
        field.append(h('div', { class: 'chips' }, ...(def.options || []).map((o) => {
          const chip = h('button', { class: `chip${set.has(o.value) ? ' on' : ''}`, onclick: () => {
            if (set.has(o.value)) { set.delete(o.value); } else { set.add(o.value); }
            chip.classList.toggle('on', set.has(o.value));
            values[key].value = [...set];
          } }, o.label);
          return chip;
        })));
      } else if (def.type === 'XCheckbox') {
        const v = cur && typeof cur === 'object' ? cur : {};
        const inc = new Set(v.include || []);
        const exc = new Set(v.exclude || []);
        const sync = () => { values[key].value = { include: [...inc], exclude: [...exc] }; };
        field.append(h('div', { class: 'chips' }, ...(def.options || []).map((o) => {
          const paint = (chip) => { chip.className = 'chip' + (inc.has(o.value) ? ' on' : exc.has(o.value) ? ' off' : ''); };
          const chip = h('button', { title: 'Click: include → exclude → off', onclick: () => {
            if (inc.has(o.value)) { inc.delete(o.value); exc.add(o.value); }
            else if (exc.has(o.value)) { exc.delete(o.value); }
            else { inc.add(o.value); }
            paint(chip); sync();
          } }, o.label);
          paint(chip);
          return chip;
        })));
      }
      form.append(field);
    }
    return h('div', {}, form, h('div', { class: 'filter-actions' },
      button('Apply Filters', { onclick: () => apply(values) }),
      button('Reset', { kind: 'secondary', onclick: () => apply(null) })));
  }

  // ---------------------------------------------------------------- editor: novel page
  let novelToken = 0;
  /** The open novel page, so pushed state/download events can update it in place. */
  /** @type {{filePath: string, reloadState: Function, onDownload: Function} | null} */
  let novelCtl = null;
  /** Document listeners belong to one render of the novel page. */
  let pageListeners = new AbortController();

  async function openNovel(sourceId, path, scrollTop, cachedOk) {
    const token = ++novelToken;
    state.view = { kind: 'novel', sourceId, path, from: state.view.kind === 'source' ? { mode: state.view.mode, query: state.view.query } : (state.view.from || null) };
    persist();
    renderList();
    editor.onscroll = null;
    const back = h('div', { class: 'breadcrumb' },
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); backToSource(); } }, icon('arrow-left'), ' ', (sourceItem(sourceId) || {}).name || 'Back'));
    if (scrollTop) {
      novelCtl = null;
      editor.replaceChildren(h('div', { class: 'page' }, back, spinner('Loading novel…')));
      editor.scrollTop = 0;
    }
    try {
      const novel = await call('novel', { sourceId, path, cachedOk: !!cachedOk });
      if (token !== novelToken) { return; }
      const prevScroll = editor.scrollTop;
      editor.replaceChildren(h('div', { class: 'page' }, back, novelPage(sourceId, novel)));
      if (!scrollTop) { editor.scrollTop = prevScroll; }
    } catch (err) {
      if (token !== novelToken) { return; }
      novelCtl = null;
      editor.replaceChildren(h('div', { class: 'page' }, back, errorBox(err.message, () => openNovel(sourceId, path, true))));
    }
  }

  function backToSource() {
    novelCtl = null;
    const from = state.view.from || {};
    const id = state.view.sourceId;
    state.view = { kind: 'source', sourceId: id, mode: from.mode || 'popular', query: from.query || '' };
    persist();
    renderList();
    renderSource();
  }

  function novelPage(sourceId, novel) {
    const chapters = novel.chapters || [];
    const filePath = novel.filePath;
    pageListeners.abort();
    pageListeners = new AbortController();
    const signal = pageListeners.signal;
    /** Chapter state, kept current by pushed events. */
    const cs = {
      progress: novel.progress || 0,
      read: new Set(novel.read || []),
      bookmarks: new Set(novel.bookmarks || []),
      downloaded: new Set(novel.downloaded || []),
      download: novel.download || null,
    };
    const started = () => cs.progress > 0 || cs.read.size > 0;

    const libBtn = novel.inLibrary
      ? button('In Library', { kind: 'secondary', icon: 'check', title: 'Remove from Library', onclick: () => setLibrary(false) })
      : button('Add to Library', { icon: 'add', onclick: () => setLibrary(true) });
    async function setLibrary(inLibrary) {
      try {
        await call('setLibrary', { filePath, inLibrary });
        toast(inLibrary ? `Added “${novel.name}” to the library` : `Removed “${novel.name}” from the library`);
        void openNovel(sourceId, novel.path, false, true);
      } catch (err) { toast(err.message, 'error'); }
    }
    const read = (index) => call('read', { filePath, index }).catch((err) => toast(err.message, 'error'));
    const act = (method, params, message) =>
      call(method, Object.assign({ filePath }, params)).then(() => { if (message) { toast(message); } }).catch((err) => toast(err.message, 'error'));

    /** The first unread chapter, where "Continue" and "Next N" start. */
    const firstUnread = () => { for (let i = 0; i < chapters.length; i++) { if (!cs.read.has(i)) { return i; } } return chapters.length; };
    /** Where reading resumes: the last chapter opened, or the next unread one once that is finished. */
    const resumeIndex = () => {
      const at = Math.min(cs.progress || 0, chapters.length - 1);
      if (!cs.read.has(at)) { return at; }
      for (let i = at + 1; i < chapters.length; i++) { if (!cs.read.has(i)) { return i; } }
      return at;
    };
    const continueBtn = h('span', {});
    function paintContinue() {
      continueBtn.replaceChildren(chapters.length
        ? button(started() ? `Continue · Ch. ${resumeIndex() + 1}` : 'Start Reading', { kind: novel.inLibrary ? 'primary' : 'secondary', icon: 'book', onclick: () => read(resumeIndex()) })
        : '');
    }

    const genres = (novel.genres || '').split(/\s*,\s*/).filter(Boolean);
    const header = h('div', { class: 'novel-header' },
      h('div', { class: 'novel-cover' }, img(novel.cover, sourceId, 'cover', novel.name)),
      h('div', { class: 'details' },
        h('h1', { class: 'name' }, novel.name),
        h('div', { class: 'subtitle' },
          novel.author ? h('span', {}, icon('person'), ' ', novel.author) : null,
          novel.author ? h('span', { class: 'sep' }, '|') : null,
          h('span', {}, icon('list-ordered'), ` ${chapters.length} chapters`),
          novel.status ? h('span', { class: 'sep' }, '|') : null,
          novel.status ? h('span', { class: 'pill' }, novel.status) : null),
        genres.length ? h('div', { class: 'tags' }, ...genres.slice(0, 14).map((g) => h('span', { class: 'tag' }, g))) : null,
        h('div', { class: 'actions' },
          libBtn,
          continueBtn,
          button('', { kind: 'secondary', icon: 'link-external', title: 'Open on site', onclick: () => call('openExternal', { url: novel.url }) }),
          button('', { kind: 'secondary', icon: 'refresh', title: 'Check for new chapters', onclick: () => { call('novel', { sourceId, path: novel.path, refresh: true }).then(() => openNovel(sourceId, novel.path, false, true)).catch((e) => toast(e.message, 'error')); } }))));

    const summary = novel.summary
      ? h('div', { class: 'summary' }, ...String(novel.summary).split(/\n+/).filter(Boolean).map((p) => h('p', {}, p)))
      : null;

    // ---- chapter list: filters, selection, download menu, progress
    const filters = { unread: false, downloaded: false, bookmarked: false };
    const selected = new Set();
    let lastClicked = -1;
    let reversed = false;
    /** @type {Map<number, HTMLElement>} */
    const rowEls = new Map();
    let visible = /** @type {number[]} */ ([]);

    const list = h('div', { class: 'chapters' });
    const query = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'search inline', placeholder: 'Filter chapters', oninput: () => fill() }));
    const stats = h('span', { class: 'chapter-stats' });
    const chip = (key, label, iconName) => {
      const el = h('button', { class: 'chip', title: `Show only ${label.toLowerCase()} chapters`, onclick: () => { filters[key] = !filters[key]; el.classList.toggle('on', filters[key]); fill(); } }, icon(iconName), ' ', label);
      return el;
    };

    // Download menu, the app's "download next / unread / all".
    const menu = h('div', { class: 'menu', hidden: true });
    const missing = (list) => list.filter((i) => !cs.downloaded.has(i));
    const range = (from, n) => Array.from({ length: Math.max(0, Math.min(n, chapters.length - from)) }, (_, k) => from + k);
    function download(indexes) {
      const todo = missing(indexes);
      menu.hidden = true;
      if (todo.length === 0) { toast('Already downloaded'); return; }
      void act('download', { indexes: todo });
    }
    function openMenu() {
      const all = range(0, chapters.length);
      const unread = all.filter((i) => !cs.read.has(i));
      const from = firstUnread();
      const item = (label, indexes, iconName) => {
        const n = missing(indexes).length;
        return h('button', { class: 'menu-item', disabled: n === 0, onclick: () => download(indexes) }, icon(iconName), h('span', { class: 'label' }, label), h('span', { class: 'hint' }, n ? `${n}` : '✓'));
      };
      menu.replaceChildren(
        item('Next chapter', range(from, 1), 'cloud-download'),
        item('Next 5 chapters', range(from, 5), 'cloud-download'),
        item('Next 10 chapters', range(from, 10), 'cloud-download'),
        item('Unread chapters', unread, 'cloud-download'),
        item('All chapters', all, 'cloud-download'),
        h('div', { class: 'menu-sep' }),
        h('button', { class: 'menu-item', disabled: cs.downloaded.size === 0, onclick: () => {
          menu.hidden = true;
          call('deleteDownloads', { filePath, indexes: [...cs.downloaded] }).then(applyState).then(() => toast('Deleted downloaded chapters')).catch((e) => toast(e.message, 'error'));
        } }, icon('trash'), h('span', { class: 'label' }, 'Delete all downloads'), h('span', { class: 'hint' }, cs.downloaded.size ? String(cs.downloaded.size) : '')));
      menu.hidden = !menu.hidden;
    }
    document.addEventListener('click', (e) => { if (!menu.hidden && !(/** @type {HTMLElement} */ (e.target)).closest('.menu-anchor')) { menu.hidden = true; } }, { signal });
    const downloadBtn = h('div', { class: 'menu-anchor' }, iconButton('cloud-download', 'Download…', openMenu), menu);

    const progressBar = h('div', { class: 'dl-progress', hidden: true });
    function paintDownload() {
      const d = cs.download;
      if (!d || (!d.running && d.done === d.total && !d.failed)) { progressBar.hidden = true; return; }
      if (!d.running) {
        progressBar.hidden = !d.failed;
        progressBar.replaceChildren(icon('warning'), h('span', {}, `${d.failed} of ${d.total} chapters failed to download.`), h('span', { class: 'muted small' }, d.lastError || ''));
        return;
      }
      progressBar.hidden = false;
      const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
      progressBar.replaceChildren(
        icon('loading', 'codicon-modifier-spin'),
        h('span', {}, `Downloading ${d.done} / ${d.total}`),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
        d.failed ? h('span', { class: 'muted small' }, `${d.failed} failed`) : null,
        h('button', { class: 'link-btn', onclick: () => act('cancelDownload', {}) }, 'Cancel'));
    }

    // Selection bar, appears while chapters are selected, like the app's action bar.
    const selBar = h('div', { class: 'selection-bar', hidden: true });
    function selectedList() { return [...selected].sort((a, b) => a - b); }
    function clearSelection() { selected.clear(); lastClicked = -1; paintAll(); }
    function paintSelection() {
      list.classList.toggle('selecting', selected.size > 0);
      selBar.hidden = selected.size === 0;
      if (selected.size === 0) { return; }
      const idx = selectedList();
      const allRead = idx.every((i) => cs.read.has(i));
      const allMarked = idx.every((i) => cs.bookmarks.has(i));
      const anyDownloaded = idx.some((i) => cs.downloaded.has(i));
      const done = (fn) => () => { fn(); clearSelection(); };
      selBar.replaceChildren(
        h('span', { class: 'count' }, `${selected.size} selected`),
        h('span', { class: 'spacer' }),
        allRead
          ? button('Mark Unread', { kind: 'secondary', small: true, icon: 'circle-large-outline', onclick: done(() => act('setRead', { indexes: idx, read: false })) })
          : button('Mark Read', { kind: 'secondary', small: true, icon: 'check', onclick: done(() => act('setRead', { indexes: idx, read: true })) }),
        idx.length === 1 ? button('Mark Previous Read', { kind: 'secondary', small: true, icon: 'check-all', onclick: done(() => act('markPreviousRead', { index: idx[0] })) }) : '',
        button(allMarked ? 'Unbookmark' : 'Bookmark', { kind: 'secondary', small: true, icon: 'bookmark', onclick: done(() => act('setBookmark', { indexes: idx, on: !allMarked })) }),
        button('Download', { kind: 'secondary', small: true, icon: 'cloud-download', onclick: done(() => download(idx)) }),
        anyDownloaded ? button('Delete', { kind: 'secondary', small: true, icon: 'trash', title: 'Delete downloaded copies',
          onclick: done(() => call('deleteDownloads', { filePath, indexes: idx }).then(applyState).catch((e) => toast(e.message, 'error'))) }) : '',
        h('span', { class: 'sep' }, '|'),
        h('button', { class: 'link-btn', title: 'Select every chapter in the list', onclick: () => { visible.forEach((i) => selected.add(i)); paintAll(); } }, 'All'),
        h('button', { class: 'link-btn', title: 'Invert the selection', onclick: () => { visible.forEach((i) => (selected.has(i) ? selected.delete(i) : selected.add(i))); paintAll(); } }, 'Invert'),
        iconButton('close', 'Clear selection (Esc)', clearSelection));
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected.size) { clearSelection(); } }, { signal });

    function toggleSelect(i, shift) {
      if (shift && lastClicked >= 0) {
        const a = visible.indexOf(lastClicked);
        const b = visible.indexOf(i);
        if (a >= 0 && b >= 0) { visible.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((k) => selected.add(k)); }
      } else if (selected.has(i)) { selected.delete(i); } else { selected.add(i); }
      lastClicked = i;
      paintAll();
    }

    function renderRow(c, i) {
      const box = h('span', { class: 'check', role: 'checkbox', title: 'Select (Shift-click for a range)',
        onclick: (e) => { e.stopPropagation(); toggleSelect(i, e.shiftKey); } }, icon('check'));
      const dl = h('button', { class: 'icon-btn dl', onclick: (e) => {
        e.stopPropagation();
        if (cs.downloaded.has(i)) { call('deleteDownloads', { filePath, indexes: [i] }).then(applyState).catch((err) => toast(err.message, 'error')); }
        else { download([i]); }
      } });
      const row = h('div', { class: 'chapter', tabindex: '0',
        onclick: (e) => {
          // While selecting, a click selects, the app's long-press selection mode.
          if (selected.size > 0 || e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(i, e.shiftKey); return; }
          read(i);
        },
        onkeydown: (e) => { if (e.key === 'Enter') { read(i); } else if (e.key === ' ') { e.preventDefault(); toggleSelect(i, e.shiftKey); } } },
      box,
      h('span', { class: 'num' }, String(i + 1)),
      h('span', { class: 'cname' }, c.name),
      h('span', { class: 'marks' }),
      c.releaseTime ? h('span', { class: 'time' }, formatTime(c.releaseTime)) : null,
      dl);
      paintRow(row, i);
      return row;
    }

    function paintRow(row, i) {
      const isRead = cs.read.has(i);
      const current = started() && i === resumeIndex();
      row.classList.toggle('read', isRead && !current);
      row.classList.toggle('current', current);
      row.classList.toggle('selected', selected.has(i));
      row.querySelector('.check').setAttribute('aria-checked', String(selected.has(i)));
      const marks = row.querySelector('.marks');
      marks.replaceChildren(
        cs.bookmarks.has(i) ? h('span', { class: 'bm', title: 'Bookmarked' }, icon('bookmark')) : '',
        current ? h('span', { class: 'reading' }, 'reading') : '');
      const dl = row.querySelector('.dl');
      const has = cs.downloaded.has(i);
      dl.classList.toggle('done', has);
      dl.title = has ? 'Downloaded. Click to delete.' : 'Download';
      dl.replaceChildren(icon(has ? 'pass-filled' : 'cloud-download'));
    }

    function paintAll() {
      rowEls.forEach((row, i) => paintRow(row, i));
      paintSelection();
      paintStats();
      paintContinue();
    }

    function paintStats() {
      stats.textContent = `${cs.read.size} read · ${cs.downloaded.size} downloaded${cs.bookmarks.size ? ` · ${cs.bookmarks.size} bookmarked` : ''}`;
    }

    function fill() {
      const q = query.value.trim().toLowerCase();
      visible = [];
      for (let i = 0; i < chapters.length; i++) {
        if (filters.unread && cs.read.has(i)) { continue; }
        if (filters.downloaded && !cs.downloaded.has(i)) { continue; }
        if (filters.bookmarked && !cs.bookmarks.has(i)) { continue; }
        if (q && !chapters[i].name.toLowerCase().includes(q)) { continue; }
        visible.push(i);
      }
      if (reversed) { visible.reverse(); }
      list.replaceChildren();
      rowEls.clear();
      let shown = 0;
      const more = h('button', { class: 'link-btn more' }, '');
      const step = () => {
        for (const i of visible.slice(shown, shown + 200)) {
          const row = renderRow(chapters[i], i);
          rowEls.set(i, row);
          list.append(row);
        }
        shown += 200;
        more.remove();
        if (shown < visible.length) { more.textContent = `Show more (${visible.length - shown} left)`; list.append(more); }
      };
      more.onclick = step;
      step();
      if (visible.length === 0) {
        list.append(h('div', { class: 'empty' }, chapters.length ? 'No chapter matches these filters.' : 'This novel has no chapters yet.'));
      }
      paintSelection();
      paintStats();
    }

    function applyState(next) {
      cs.progress = next.progress || 0;
      cs.read = new Set(next.read || []);
      cs.bookmarks = new Set(next.bookmarks || []);
      cs.downloaded = new Set(next.downloaded || []);
      cs.download = next.download || cs.download;
      if (filters.unread || filters.downloaded || filters.bookmarked) { fill(); }
      paintAll();
      paintDownload();
    }

    let reloadTimer = 0;
    novelCtl = {
      filePath,
      reloadState: () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { call('chapterState', { filePath }).then(applyState).catch(() => {}); }, 150);
      },
      onDownload: (status) => {
        cs.download = status;
        paintDownload();
        // Refresh the ✓ marks every few chapters, and once at the end.
        if (!status.running || status.done % 4 === 0) { novelCtl && novelCtl.reloadState(); }
      },
    };

    fill();
    paintAll();
    paintDownload();

    return h('div', {},
      header,
      summary ? h('div', { class: 'section-title' }, 'About') : null,
      summary,
      h('div', { class: 'section-title row-title' },
        h('span', {}, `Chapters (${chapters.length})`), stats, h('span', { class: 'spacer' }),
        chip('unread', 'Unread', 'circle-large-outline'), chip('downloaded', 'Downloaded', 'pass-filled'), chip('bookmarked', 'Bookmarked', 'bookmark'),
        h('div', { class: 'search-box small' }, icon('filter'), query),
        iconButton('arrow-swap', 'Reverse order', () => { reversed = !reversed; fill(); }),
        downloadBtn),
      progressBar,
      selBar,
      list);
  }

  // ---------------------------------------------------------------- boot
  renderList();
  if (state.view.kind === 'novel') { void openNovel(state.view.sourceId, state.view.path, true); }
  else if (state.view.kind === 'source') { renderSource(); }
  else { showWelcome(); }
  void loadCatalog(false);
})();
