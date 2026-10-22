// Unit test for how cat clips reach the page: the background worker's GET_CAT_VIDEO
// reply, its cache, and how much it downloads on install / update / startup.
// Loads the REAL background.js in a vm sandbox with a mocked chrome API, and the REAL
// base64ToBytes from content.js, so both ends of the message are exercised together.
//
// Why this exists: Chrome's extension messaging is JSON-serialised. The worker used to
// reply `{ ok: true, buffer: <ArrayBuffer> }`, which arrives as `{ ok: true, buffer: {} }`,
// so the page built its <video> from "[object Object]" and no cat ever played. And every
// install and update re-downloaded the whole clip library for every user.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const background = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
const content = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ pass: Boolean(cond) });
  console.log(`${cond ? '  PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = 'https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/public/cat-videos/';
const NAMES = [
  'cat-alley-amble', 'cat-curious-stroll', 'cat-elegant-steps', 'cat-garden-stroll', 'cat-lazy-stretch',
  'cat-morning-paws', 'cat-street-strut', 'cat-twilight-prowl', 'cat-window-watcher'
].map((n) => `${n}.mp4`);
// Every byte value, and longer than the 32 KB chunk the encoder works in.
const CLIP = Buffer.from(Array.from({ length: 100003 }, (_, i) => i % 256));

function makeEnv({ settings } = {}) {
  const local = settings ? { settings } : {};
  const listeners = {};
  const cap = (ns) => ({ addListener: (fn) => { (listeners[ns] ||= []).push(fn); } });
  const chrome = {
    runtime: { id: 'test-extension', onInstalled: cap('installed'), onStartup: cap('startup'), onMessage: cap('message') },
    alarms: { clearAll: (cb) => cb && cb(), create: () => {}, onAlarm: cap('alarm') },
    tabs: {
      query: async () => [], get: async () => ({}), sendMessage: async () => ({ ok: true }),
      onActivated: cap('activated'), onUpdated: cap('updated'), onRemoved: cap('removed')
    },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: cap('focus') },
    scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    storage: {
      local: {
        get: async (k) => (k == null ? { ...local } : Object.fromEntries([].concat(k).map((key) => [key, local[key]]))),
        set: async (o) => { Object.assign(local, o); }
      },
      session: { get: async () => ({}), set: async () => {} }
    }
  };

  // Cache API: named buckets of url -> bytes
  const buckets = new Map();
  const bucket = (name) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return buckets.get(name);
  };
  const caches = {
    keys: async () => [...buckets.keys()],
    delete: async (name) => buckets.delete(name),
    open: async (name) => {
      const store = bucket(name);
      const asUrl = (req) => (typeof req === 'string' ? req : req.url);
      return {
        match: async (req) => (store.has(asUrl(req)) ? new Response(store.get(asUrl(req))) : undefined),
        put: async (req, res) => { store.set(asUrl(req), Buffer.from(await res.arrayBuffer())); },
        keys: async () => [...store.keys()].map((url) => ({ url }))
      };
    }
  };

  const net = { log: [], mode: 'ok', delayMs: 0 };
  const fetchStub = async (url, opts = {}) => {
    net.log.push(url);
    if (url.includes('/object/list/')) {
      return new Response(JSON.stringify(NAMES.map((name) => ({ name }))), { status: 200 });
    }
    if (net.mode === 'down') return new Response('quota', { status: 402 });
    if (net.mode === 'stall') {
      return new Promise((_, reject) => opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (net.delayMs) await sleep(net.delayMs);
    return new Response(CLIP, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
  };

  const sandbox = {
    chrome, console, clearTimeout, setInterval, clearInterval,
    // the worker's 30s download timeout, shrunk so the stall test doesn't take 30s
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 40)),
    Date, URL, Math, Number, Boolean, Object, Promise, Array, JSON, Map, Set, Uint8Array, String,
    Response, AbortController, btoa, fetch: fetchStub, caches
  };
  vm.createContext(sandbox);
  vm.runInContext(background, sandbox);

  const fire = async (ns, arg) => { for (const fn of (listeners[ns] || [])) await fn(...arg); };
  // Same path a content script takes: the reply goes through sendResponse.
  const ask = (msg) => new Promise((resolve) => {
    for (const fn of listeners.message) fn(msg, { tab: { id: 1 } }, resolve);
  });
  return {
    local, net, fire, ask, bucket, sandbox,
    mp4Fetches: () => net.log.filter((u) => u.endsWith('.mp4')),
    pending: () => vm.runInContext('pendingVideoDownloads.size', sandbox)
  };
}

// The content script's decoder, lifted from the real file.
const decoderSrc = content.match(/function base64ToBytes\(b64\) \{[\s\S]*?\n\}/);
if (!decoderSrc) { console.error('Could not locate base64ToBytes in content.js'); process.exit(2); }
const base64ToBytes = new Function('atob', 'Uint8Array', `return (${decoderSrc[0]})`)(atob, Uint8Array);

async function main() {
  // 1) The reply must survive JSON — that is how extension messaging serialises it.
  {
    const env = makeEnv();
    const reply = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-morning-paws.mp4' });
    const wire = JSON.parse(JSON.stringify(reply));
    ok('GET_CAT_VIDEO reply carries the clip as text', wire.ok === true && typeof wire.base64 === 'string');
    ok('GET_CAT_VIDEO reply has no raw buffer (JSON would turn it into {})', !('buffer' in wire));
    ok('clip bytes survive the JSON round-trip', Buffer.from(wire.base64, 'base64').equals(CLIP));
    ok('content script decodes what the worker sends', Buffer.from(base64ToBytes(wire.base64)).equals(CLIP));
  }

  // 2) Cache-first: a clip is downloaded once, then served from disk.
  {
    const env = makeEnv();
    await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-morning-paws.mp4' });
    const second = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-morning-paws.mp4' });
    ok('second request is served from the cache', env.mp4Fetches().length === 1 && second.ok === true,
      `${env.mp4Fetches().length} download(s)`);
    ok('legacy assets/ keys resolve to the flat file',
      (await env.ask({ type: 'GET_CAT_VIDEO', file: 'assets/cat-morning-paws.mp4' })).ok === true && env.mp4Fetches().length === 1);
  }

  // 3) Install fetches only the clip the user will see — not the whole library.
  {
    const env = makeEnv();
    await env.fire('installed', [{ reason: 'install' }]);
    await sleep(60);
    ok('install downloads exactly one clip (the default)',
      env.mp4Fetches().length === 1 && env.mp4Fetches()[0] === `${BASE}cat-morning-paws.mp4`,
      `${env.mp4Fetches().length} of ${NAMES.length}`);
    ok('install still refreshes the clip list for the picker', env.local.catVideoManifest?.length === NAMES.length);
  }
  {
    const env = makeEnv({ settings: { enabled: true, catVideoFile: 'cat-lazy-stretch.mp4' } });
    await env.fire('installed', [{ reason: 'install' }]);
    await sleep(60);
    ok('install warms the clip the user picked', env.mp4Fetches().join() === `${BASE}cat-lazy-stretch.mp4`);
  }

  // 4) Update re-downloads nothing it already has, and drops stale cache buckets.
  {
    const env = makeEnv({ settings: { enabled: true, catVideoFile: 'cat-morning-paws.mp4' } });
    env.bucket('cat-videos-v1').set(`${BASE}cat-morning-paws.mp4`, CLIP);
    env.bucket('cat-videos-v0').set(`${BASE}old.mp4`, CLIP);
    await env.fire('installed', [{ reason: 'update' }]);
    await sleep(60);
    ok('update with a warm cache downloads no clips', env.mp4Fetches().length === 0, `${env.mp4Fetches().length} download(s)`);
    ok('update keeps the current cache bucket', env.bucket('cat-videos-v1').size === 1);
    ok('update purges buckets from older releases', !(await env.sandbox.caches.keys()).includes('cat-videos-v0'));
  }
  {
    const env = makeEnv();
    await env.fire('installed', [{ reason: 'update' }]);
    await sleep(60);
    ok('update with an empty cache fetches just the selected clip', env.mp4Fetches().length === 1);
  }

  // 5) Browser start re-warms the selected clip only when it is missing.
  {
    const env = makeEnv();
    await env.fire('startup', []);
    await sleep(60);
    ok('startup with an empty cache fetches one clip', env.mp4Fetches().length === 1);
    await env.fire('startup', []);
    await sleep(60);
    ok('startup with a warm cache fetches nothing', env.mp4Fetches().length === 1);
  }

  // 6) A host that refuses (quota, outage) still yields a cat when any clip is cached.
  {
    const env = makeEnv();
    env.bucket('cat-videos-v1').set(`${BASE}cat-morning-paws.mp4`, CLIP);
    env.net.mode = 'down';
    const reply = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-lazy-stretch.mp4' });
    ok('refusing host: falls back to a cached clip', reply.ok === true && Buffer.from(reply.base64, 'base64').equals(CLIP));
  }
  {
    const env = makeEnv();
    env.net.mode = 'down';
    const reply = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-lazy-stretch.mp4' });
    ok('refusing host, cold cache: reports failure rather than a broken clip', reply.ok === false && !('base64' in reply));
  }

  // 7) Concurrent requests for one clip share a single download.
  {
    const env = makeEnv();
    env.net.delayMs = 15;
    const [a, b] = await Promise.all([
      env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-street-strut.mp4' }),
      env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-street-strut.mp4' })
    ]);
    ok('two simultaneous requests, one download', a.ok && b.ok && env.mp4Fetches().length === 1, `${env.mp4Fetches().length} download(s)`);
  }

  // 8) A host that never answers is abandoned, and doesn't wedge later requests.
  {
    const env = makeEnv();
    env.net.mode = 'stall';
    const stalled = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-street-strut.mp4' });
    ok('stalled host: request gives up instead of hanging', stalled.ok === false);
    ok('stalled host: nothing left in flight', env.pending() === 0);
    env.net.mode = 'ok';
    const recovered = await env.ask({ type: 'GET_CAT_VIDEO', file: 'cat-street-strut.mp4' });
    ok('after the host recovers the next request works', recovered.ok === true);
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
