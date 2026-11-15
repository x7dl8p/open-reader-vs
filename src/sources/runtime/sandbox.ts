import * as vm from 'vm';
import { load } from 'cheerio';
import { Parser } from 'htmlparser2';
import dayjs from 'dayjs';
import { encode, decode } from 'urlencode';
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';
import type { SourcePlugin } from '../types';
import { fetchApi, fetchProto, fetchText, USER_AGENT } from './fetch';
import { KeyValueFile, PluginStorage, PluginWebStorage } from './storage';

const NovelStatus = {
  Unknown: 'Unknown',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
  STUB: 'STUB',
  Inactive: 'Inactive',
};

const FilterTypes = {
  TextInput: 'Text',
  Picker: 'Picker',
  CheckboxGroup: 'Checkbox',
  Switch: 'Switch',
  ExcludableCheckboxGroup: 'XCheckbox',
};

export const DEFAULT_COVER =
  'https://github.com/lnreader/lnreader-plugins/blob/master/public/static/coverNotAvailable.webp?raw=true';

const isUrlAbsolute = (url: string) =>
  typeof url === 'string' && (url.indexOf('//') === 0 || url.indexOf('://') > 0);

/** The modules a compiled plugin may `require`, exactly as the LNReader app maps them. */
const PACKAGES: Record<string, unknown> = {
  htmlparser2: { Parser },
  cheerio: { load },
  dayjs,
  urlencode: { encode, decode },
  '@libs/novelStatus': { NovelStatus },
  '@libs/fetch': { fetchApi, fetchText, fetchProto },
  '@libs/isAbsoluteUrl': { isUrlAbsolute },
  '@libs/filterInputs': { FilterTypes },
  '@libs/defaultCover': { defaultCover: DEFAULT_COVER },
  '@libs/aes': { gcm },
  '@libs/utils': { utf8ToBytes, bytesToUtf8 },
};

/**
 * Evaluate a compiled plugin and return its instance.
 *
 * The code runs in its own vm context that sees only web-style globals plus the shimmed
 * `require`, no `process`, no Node `require`, so a plugin can scrape but cannot reach
 * the file system by accident. vm is not a security boundary against hostile code: the
 * trust model is the LNReader app's, i.e. you trust the repositories you add.
 */
export function evaluatePlugin(pluginId: string, code: string, store: KeyValueFile): SourcePlugin {
  const shimRequire = (name: string): unknown => {
    if (name === '@libs/storage') {
      return {
        storage: new PluginStorage(store, pluginId),
        localStorage: new PluginWebStorage(store, pluginId, 'local'),
        sessionStorage: new PluginWebStorage(store, pluginId, 'session'),
      };
    }
    if (name in PACKAGES) {
      return PACKAGES[name];
    }
    throw new Error(`Plugin ${pluginId} requires unsupported module "${name}"`);
  };

  const context = vm.createContext({
    require: shimRequire,
    module: { exports: {} },
    console: { log: () => {}, info: () => {}, debug: () => {}, warn: console.warn, error: console.error },
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    Blob,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    AbortController,
    AbortSignal,
    atob,
    btoa,
    Buffer,
    crypto: globalThis.crypto,
    structuredClone,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  const wrapped = `(function (module, require) { var exports = module.exports; ${code}\n; return module.exports.default || exports.default; })`;
  const factory = vm.runInContext(wrapped, context, { filename: `plugin:${pluginId}.js`, timeout: 5000 }) as (
    module: unknown,
    require: unknown
  ) => SourcePlugin | undefined;
  const plugin = factory(context.module, shimRequire);
  if (!plugin || typeof plugin.popularNovels !== 'function') {
    throw new Error(`Plugin ${pluginId} did not export a plugin instance`);
  }

  // Covers on many sites only load with a browser User-Agent; the app adds one too.
  const init = plugin.imageRequestInit ?? {};
  const headers = { ...(init.headers ?? {}) };
  if (!Object.keys(headers).some((name) => name.toLowerCase() === 'user-agent')) {
    headers['User-Agent'] = USER_AGENT;
  }
  plugin.imageRequestInit = { ...init, headers };
  return plugin;
}
