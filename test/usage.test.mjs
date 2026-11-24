// Unit test for the anonymous usage stats in background.js: what is sent, what is
// never sent, and the off switch. Loads the REAL background.js with a mocked chrome API.

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

function boot(initialSettings, { failFetch = false } = {}) {
  const local = initialSettings ? { settings: initialSettings } : {};
  const listeners = {};
  const cap = (ns) => ({ addListener: (fn) => { (listeners[ns] ||= []).push(fn); } });
  const sent = [];
  const chrome = {
    runtime: { id: 'x', getManifest: () => ({ version: '9.9.9' }), onInstalled: cap('installed'), onStartup: cap('startup'), onMessage: cap('message') },
    alarms: { clearAll: (cb) => cb && cb(), create: () => {}, onAlarm: cap('alarm') },
    tabs: { query: async () => [], get: async () => ({}), sendMessage: async () => ({}), onActivated: cap('a'), onUpdated: cap('u'), onRemoved: cap('r') },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: cap('f') },
    scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    storage: {
      local: { get: async (k) => (k == null ? { ...local } : Object.fromEntries([].concat(k).map((key) => [key, local[key]]))), set: async (o) => { Object.assign(local, o); } },
      session: { get: async () => ({}), set: async () => {} }
    }
  };
  const sandbox = {
    chrome, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, URL, Math, Number, Boolean,
    Object, Promise, Array, JSON, Map, Set, Uint8Array, String, Response, AbortController, btoa, RegExp,
    fetch: async (url, opts = {}) => {
      if (String(url).includes('/rest/v1/usage_events')) {
        sent.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
        if (failFetch) throw new Error('offline');
        return new Response(null, { status: 201 });
      }
      return new Response('[]', { status: 200 });
    },
    caches: { keys: async () => [], open: async () => ({ match: async () => null, put: async () => {}, keys: async () => [] }), delete: async () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const fire = async (ns, arg) => { for (const fn of (listeners[ns] || [])) await fn(...arg); };
  const message = (msg) => new Promise((resolve) => { for (const fn of listeners.message) fn(msg, { tab: { id: 1 } }, resolve); });
  return { local, sent, fire, message };
}

const ALLOWED_START = ['reason', 'defaultLimitMin', 'lingerMin', 'shooHoldSec', 'socialOnly', 'listedOnly', 'randomCat', 'siteLimitCount', 'excludedCount'];

// 1) On by default: a fresh install reports its start, with only the allowed fields.
{
  const env = boot();
  await env.fire('installed', [{ reason: 'install' }]);
  await sleep(40);
  const start = env.sent.find((e) => e.body.name === 'extension_start');
  ok('fresh install reports extension_start without being asked', Boolean(start));
  ok('it carries the extension version', start?.body.version === '9.9.9');
  ok('props are limited to the allowed fields', Object.keys(start.body.props).every((k) => ALLOWED_START.includes(k)), Object.keys(start.body.props).join(','));
  ok('sent with the public key and no other identity', start.headers.apikey?.startsWith('sb_publishable') && Object.keys(start.body).sort().join() === 'name,props,version');
}

// 2) Never any site names, even when the user has some saved.
{
  const env = boot({ enabled: true, shareUsage: true, siteLimits: { 'secret-bank.com': 600000 }, excludedSites: ['private.example'] });
  await env.fire('installed', [{ reason: 'update' }]);
  await env.fire('startup', []);
  await sleep(40);
  const wire = JSON.stringify(env.sent.map((e) => e.body));
  ok('no saved site name appears in anything sent', !wire.includes('secret-bank') && !wire.includes('private.example') && !/https?:/.test(wire));
  ok('only counts of saved sites are sent', env.sent[0].body.props.siteLimitCount === 1 && env.sent[0].body.props.excludedCount === 1);
}

// 3) Content-script events: allowed ones pass, anything else is dropped.
{
  const env = boot({ enabled: true });
  await env.message({ type: 'USAGE', name: 'cat_shown', props: { outcome: 'static', reason: 'no_clip', domain: 'bank.com', url: 'https://bank.com/x' } });
  await env.message({ type: 'USAGE', name: 'break_ended', props: { how: 'hold', shownSec: 12.34, note: 'free text' } });
  await env.message({ type: 'USAGE', name: 'page_visit', props: { domain: 'bank.com' } });
  await env.message({ type: 'USAGE', name: 'cat_shown', props: { outcome: 'https://evil.example/path', reason: 'has spaces' } });
  await sleep(40);
  const names = env.sent.map((e) => e.body.name);
  ok('known events are sent, unknown event names are not', names.join() === 'cat_shown,break_ended,cat_shown', names.join());
  ok('extra fields (url, free text) are dropped; an unlisted site becomes "other"', JSON.stringify(env.sent[0].body.props) === '{"outcome":"static","reason":"no_clip","site":"other"}' && !('note' in env.sent[1].body.props));
  ok('numbers are rounded, strings that are not simple tokens are dropped', env.sent[1].body.props.shownSec === 12.3 && JSON.stringify(env.sent[2].body.props) === '{"site":"other"}');
  ok('the real domain never appears in anything sent', !JSON.stringify(env.sent).includes('bank.com'));
}

// 3b) Site: only our built-in sites are ever named; everything else is "other".
{
  const env = boot({ enabled: true });
  const ask = (domain, extra = {}) => env.message({ type: 'USAGE', name: 'break_ended', props: { how: 'timer', domain, ...extra } });
  await ask('youtube.com'); await ask('m.facebook.com'); await ask('www.amazon.com'); await ask('github.com'); await ask('notyoutube.com');
  await ask('secret-bank.example', { site: 'youtube.com' });   // a caller cannot choose the label
  await ask(undefined); await ask({ evil: true });
  await sleep(60);
  const sites = env.sent.map((e) => e.body.props.site);
  ok('built-in sites are named, subdomains map to the base site', sites.slice(0, 3).join() === 'youtube.com,facebook.com,amazon.com', sites.slice(0, 3).join());
  ok('any other site is "other", including look-alikes', sites[3] === 'other' && sites[4] === 'other');
  ok('a caller-supplied site label is ignored', sites[5] === 'other');
  ok('missing or odd domains are "other"', sites[6] === 'other' && sites[7] === 'other');
  ok('no unlisted domain appears anywhere on the wire', !JSON.stringify(env.sent).match(/github|secret-bank|notyoutube/));
}

// 4) The off switch.
{
  const env = boot({ enabled: true, shareUsage: false });
  await env.fire('installed', [{ reason: 'update' }]);
  await env.fire('startup', []);
  await env.message({ type: 'USAGE', name: 'cat_shown', props: { outcome: 'video' } });
  await sleep(40);
  ok('with the setting off, nothing is sent', env.sent.length === 0, `${env.sent.length} sent`);
}

// 5) A failing network never breaks the extension.
{
  const env = boot({ enabled: true }, { failFetch: true });
  let threw = false;
  try { await env.fire('installed', [{ reason: 'install' }]); await env.message({ type: 'USAGE', name: 'cat_shown', props: { outcome: 'video' } }); await sleep(40); } catch { threw = true; }
  ok('offline: reports are dropped quietly', !threw);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
