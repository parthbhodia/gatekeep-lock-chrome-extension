// Unit test for background.js daily-reset logic: the active segment's elapsed
// time must survive the midnight reset instead of being discarded.
// Loads the REAL background.js in a vm sandbox with a mocked chrome API.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ pass: Boolean(cond) });
  console.log(`${cond ? '  PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pick(store, keys) {
  if (keys == null) return { ...store };
  if (typeof keys === 'string') return { [keys]: store[keys] };
  const out = {};
  for (const k of keys) out[k] = store[k];
  return out;
}

function makeChrome() {
  const local = {};
  const session = {};
  const listeners = {};
  const cap = (ns) => ({ addListener: (fn) => { (listeners[ns] ||= []).push(fn); } });
  const tab = { id: 1, windowId: 1, url: 'https://example.com/page' };

  const chrome = {
    runtime: {
      id: 'test-extension', onInstalled: cap('installed'),
      onStartup: cap('startup'), onMessage: cap('message')
    },
    alarms: { clearAll: (cb) => cb && cb(), create: () => {}, onAlarm: cap('alarm') },
    tabs: {
      query: async () => [tab],
      get: async () => tab,
      sendMessage: async () => ({ ok: true }),
      onActivated: cap('activated'), onUpdated: cap('updated'), onRemoved: cap('removed')
    },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: cap('focus') },
    scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    storage: {
      local: { get: async (k) => pick(local, k), set: async (o) => { Object.assign(local, o); } },
      session: { get: async (k) => pick(session, k), set: async (o) => { Object.assign(session, o); } }
    }
  };
  return { chrome, local, listeners };
}

async function main() {
  const { chrome, local, listeners } = makeChrome();
  // Supabase video caching is fire-and-forget on install; stub the web APIs it
  // touches so the worker loads cleanly in the sandbox.
  const caches = {
    keys: async () => [], open: async () => ({ match: async () => null, put: async () => {} }),
    delete: async () => {}
  };
  const sandbox = {
    chrome, console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, URL, Math, Number, Boolean, Object, Promise, Array, JSON,
    fetch: async () => ({ ok: false, json: async () => [] }), caches
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const fire = async (ns, arg) => { for (const fn of (listeners[ns] || [])) await fn(...arg); };

  // 1) Initialize the worker (reason chrome_update skips the video re-cache path)
  await fire('installed', [{ reason: 'chrome_update' }]);
  ok('init created settings', Boolean(local.settings) && local.settings.enabled === true);

  // 2) Simulate having crossed midnight with prior accumulated time on two sites
  local.lastReset = 'Mon Jan 01 1990';
  local.siteTime = { 'example.com': 5000, 'other.com': 9000 };
  const today = new Date().toDateString();

  // 3) Let a measurable segment accrue, then fire the 1-minute tick
  await sleep(60);
  await fire('alarm', [{ name: 'tick' }]);

  const after = local.siteTime;
  ok('daily reset cleared other sites', after['other.com'] === undefined,
    `other.com=${after['other.com']}`);
  ok('daily reset preserved the active segment',
    after['example.com'] > 0 && after['example.com'] < 5000,
    `example.com=${after['example.com']}ms (expected ~60, NOT 0 and NOT the old 5000)`);
  ok('lastReset advanced to today', local.lastReset === today);

  // 4) Same-day tick should accumulate, not reset
  const before = local.siteTime['example.com'];
  await sleep(60);
  await fire('alarm', [{ name: 'tick' }]);
  ok('same-day tick accumulates time', local.siteTime['example.com'] > before,
    `${before}ms -> ${local.siteTime['example.com']}ms`);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Test error:', e); process.exit(2); });
