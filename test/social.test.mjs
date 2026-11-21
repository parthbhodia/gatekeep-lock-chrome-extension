// Unit test for the "social sites only" default: new installs (and existing users
// who never customised their sites) only time social sites. Loads the REAL background.js.

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

function boot(initialSettings) {
  const local = initialSettings ? { settings: initialSettings } : {};
  const listeners = {};
  const cap = (ns) => ({ addListener: (fn) => { (listeners[ns] ||= []).push(fn); } });
  const chrome = {
    runtime: { id: 'x', onInstalled: cap('installed'), onStartup: cap('startup'), onMessage: cap('message') },
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
    Object, Promise, Array, JSON, Map, Set, Uint8Array, String, Response, AbortController, btoa,
    fetch: async () => ({ ok: false, json: async () => [] }),
    caches: { keys: async () => [], open: async () => ({ match: async () => null, put: async () => {}, keys: async () => [] }), delete: async () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { local, listeners, run: (code) => vm.runInContext(code, sandbox) };
}

const s = { limitSocialOnly: true, siteLimits: {}, trackedSitesOnly: false };

// 1) The matcher: social sites and their subdomains, nothing else.
const env = boot();
const tracked = (d, settings = s) => env.run(`isTrackedDomain(${JSON.stringify(d)}, ${JSON.stringify(settings)})`);
for (const d of ['amazon.com', 'smile.amazon.com', 'youtube.com', 'instagram.com', 'm.facebook.com', 'old.reddit.com', 'x.com', 'tiktok.com']) {
  ok(`social: ${d} is timed`, tracked(d) === true);
}
for (const d of ['notamazon.com', 'github.com', 'docs.google.com', 'notyoutube.com', 'fakex.com', 'nytimes.com']) {
  ok(`not social: ${d} is not timed`, tracked(d) === false);
}
ok('a site on Limit by site is timed even when not social', tracked('github.com', { ...s, siteLimits: { 'github.com': 600000 } }) === true);
ok('social-only off: everything is timed (existing behaviour)', tracked('github.com', { limitSocialOnly: false, siteLimits: {} }) === true);
ok('list-only mode still wins: social sites not on the list are skipped', tracked('youtube.com', { limitSocialOnly: true, trackedSitesOnly: true, siteLimits: {} }) === false);
ok('limit for a social site is the default limit', env.run(`getDomainLimit('youtube.com', {limitSocialOnly:true, defaultLimit: 1800000, siteLimits:{}})`) === 1800000);
ok('limit for a non-social site is 0 (off)', env.run(`getDomainLimit('github.com', {limitSocialOnly:true, defaultLimit: 1800000, siteLimits:{}})`) === 0);

// 2) Defaults: new installs on, existing users untouched.
const fresh = boot();
for (const fn of fresh.listeners.installed) await fn({ reason: 'install' });
ok('fresh install: social-only is ON', fresh.local.settings.limitSocialOnly === true);
const existing = boot({ defaultLimit: 1800000, siteLimits: {}, excludedSites: [], enabled: true });
for (const fn of existing.listeners.installed) await fn({ reason: 'update' });
ok('existing user who never customised sites: switched ON once on update', existing.local.settings.limitSocialOnly === true);
const custom = boot({ enabled: true, siteLimits: { 'github.com': 600000 } });
for (const fn of custom.listeners.installed) await fn({ reason: 'update' });
ok('existing user with their own site list: left as they were (OFF)', custom.local.settings.limitSocialOnly === false);
const listed = boot({ enabled: true, trackedSitesOnly: true, siteLimits: {} });
for (const fn of listed.listeners.installed) await fn({ reason: 'update' });
ok('existing user in list-only mode: left as they were (OFF)', listed.local.settings.limitSocialOnly === false);
const chose = boot({ enabled: true, limitSocialOnly: false, siteLimits: {} });
for (const fn of chose.listeners.installed) await fn({ reason: 'update' });
ok('a user who already has the setting keeps their choice', chose.local.settings.limitSocialOnly === false);
const opted = boot({ enabled: true, limitSocialOnly: true });
for (const fn of opted.listeners.installed) await fn({ reason: 'update' });
ok('already ON stays ON', opted.local.settings.limitSocialOnly === true);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
