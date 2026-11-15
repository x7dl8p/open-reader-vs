/**
 * Node port of LNReader's @libs/fetch (lnreader/src/plugins/helpers/fetch.ts).
 *
 * Differences from the app: there is no WebView sharing a cookie jar, so a small jar
 * per host keeps session cookies a site sets between requests; and the headers Node's
 * fetch refuses to set (Connection, Accept-Encoding) are left out.
 */

export type FetchInit = {
  headers?: Record<string, string | undefined> | Headers;
  method?: string;
  body?: unknown;
  [x: string]: unknown;
};

export const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': '*',
  'Sec-Fetch-Mode': 'cors',
  'Cache-Control': 'max-age=0',
  'User-Agent': USER_AGENT,
};

const REQUEST_TIMEOUT_MS = 30_000;

/** host → cookie name → value */
const jar = new Map<string, Map<string, string>>();

function cookieHeader(url: URL): string | undefined {
  const cookies = jar.get(url.hostname);
  if (!cookies || cookies.size === 0) {
    return undefined;
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

function rememberCookies(url: string, res: Response): void {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    return;
  }
  const host = new URL(url).hostname;
  const cookies = jar.get(host) ?? new Map<string, string>();
  for (const line of setCookies) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  jar.set(host, cookies);
}

function makeInit(url: string, init?: FetchInit): RequestInit {
  const headers = new Headers();
  for (const [name, value] of Object.entries(DEFAULT_HEADERS)) {
    headers.set(name, value);
  }
  if (init?.headers instanceof Headers) {
    init.headers.forEach((value, name) => headers.set(name, value));
  } else if (init?.headers) {
    for (const [name, value] of Object.entries(init.headers)) {
      if (value !== undefined) {
        headers.set(name, String(value));
      }
    }
  }
  try {
    const cookie = cookieHeader(new URL(url));
    if (cookie && !headers.has('Cookie')) {
      headers.set('Cookie', cookie);
    }
  } catch {
    // An invalid URL fails in fetch itself, with a clearer message.
  }
  return {
    ...(init as RequestInit),
    headers,
    signal: (init?.signal as AbortSignal | undefined) ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

export async function fetchApi(url: string, init?: FetchInit): Promise<Response> {
  const res = await fetch(url, makeInit(url, init));
  rememberCookies(url, res);
  return res;
}

/** Text of the response, or '' on any failure, the app's contract, which plugins rely on. */
export async function fetchText(url: string, init?: FetchInit, encoding?: string): Promise<string> {
  try {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      return '';
    }
    return new TextDecoder(encoding).decode(await res.arrayBuffer());
  } catch {
    return '';
  }
}

type ProtoRequestInit = {
  proto: string;
  requestType: string;
  requestData?: Record<string, unknown>;
  responseType: string;
};

/** gRPC-web style call. Only wuxiaworld uses it, so protobufjs loads on first use. */
export async function fetchProto(protoInit: ProtoRequestInit, url: string, init?: FetchInit): Promise<unknown> {
  const { parse } = require('protobufjs') as typeof import('protobufjs');
  const root = parse(protoInit.proto).root;
  const RequestMessage = root.lookupType(protoInit.requestType);
  const invalid = RequestMessage.verify(protoInit.requestData || {});
  if (invalid) {
    throw new Error(`Invalid proto: ${invalid}`);
  }
  const encoded = RequestMessage.encode(protoInit.requestData || {}).finish();
  const body = new Uint8Array(5 + encoded.length);
  new DataView(body.buffer).setUint32(1, encoded.length);
  body.set(encoded, 5);

  const res = await fetch(url, { method: 'POST', ...makeInit(url, init), body });
  const payload = new Uint8Array(await res.arrayBuffer());
  const length = new DataView(payload.buffer, payload.byteOffset).getUint32(1);
  return root.lookupType(protoInit.responseType).decode(payload.slice(5, 5 + length));
}
