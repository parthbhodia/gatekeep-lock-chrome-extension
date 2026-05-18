// background.js — Cat Break service worker
// Tracks active tab time per domain and triggers the cat when limits are hit.

// ─── Supabase CDN ─────────────────────────────────────────────────────────────

const SUPABASE_BASE = 'https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/public/cat-videos/';
const SUPABASE_LIST_URL = 'https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/list/cat-videos';
// Publishable (anon) key — safe to ship in client code, read-only access only
const SUPABASE_ANON_KEY = 'sb_publishable__RWZ07cSXRVJsMRnNoUjww_rGfM1dB6';
const VIDEO_CACHE_NAME = 'cat-videos-v1';

/** Strip legacy assets/ prefix so all file keys are flat (e.g. 'cat-curious.mp4'). */
function normalizeVideoFile(file) {
  return (file || '').replace(/^assets\//, '');
}

/** Returns the public Supabase URL for a video file. */
function getSupabaseUrl(file) {
  return SUPABASE_BASE + normalizeVideoFile(file);
}

/**
 * Hardcoded fallback — used when Supabase is unreachable or the listing
 * policy hasn't been enabled yet. Does not need to be kept in sync manually;
 * the live list from the Storage API takes precedence once the policy is on.
 */
const DEFAULT_CAT_VIDEO_FILES = [
  'cat-alley-amble.mp4',
  'cat-chill.mp4',
  'cat-curious.mp4',
  'cat-curious-stroll.mp4',
  'cat-elegant-steps.mp4',
  'cat-garden-stroll.mp4',
  'cat-lazy-stretch.mp4',
  'cat-morning-paws.mp4',
  'cat-playful.mp4',
  'cat-sad-meow.mp4',
  'cat-street-strut.mp4',
  'cat-twilight-prowl.mp4',
  'cat-window-watcher.mp4'
];

/**
 * Fetch the live file list directly from Supabase Storage.
 * Requires a SELECT policy on storage.objects for the anon role
 * (Supabase Dashboard → Storage → cat-videos → Policies).
 */
async function fetchLiveVideoList() {
  try {
    const res = await fetch(SUPABASE_LIST_URL, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix: '', limit: 200 }),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;
    // Extract filenames, flatten any legacy assets/ prefix, keep only cat-*.mp4
    const files = items
      .map((item) => normalizeVideoFile(item.name || ''))
      .filter((f) => /^cat-[a-z0-9-]+\.mp4$/.test(f))
      .sort();
    if (files.length === 0) return null;
    await chrome.storage.local.set({ catVideoManifest: files, catVideoManifestTs: Date.now() });
    return files;
  } catch {
    return null;
  }
}

/**
 * Returns the current video list.
 * Checks cache first (6-hour TTL), then fetches live from Supabase Storage,
 * then falls back to the hardcoded default list if offline / policy not set yet.
 */
async function getVideoManifest() {
  try {
    const { catVideoManifest, catVideoManifestTs } = await chrome.storage.local.get([
      'catVideoManifest',
      'catVideoManifestTs'
    ]);
    const stale =
      !catVideoManifestTs || Date.now() - catVideoManifestTs > 6 * 60 * 60 * 1000;
    if (catVideoManifest && !stale) return catVideoManifest;
    const fresh = await fetchLiveVideoList();
    return fresh || catVideoManifest || DEFAULT_CAT_VIDEO_FILES;
  } catch {
    return DEFAULT_CAT_VIDEO_FILES;
  }
}

/** Download and cache all cat videos from Supabase. Called on install/update. */
async function cacheAllVideos() {
  try {
    // Always fetch a fresh list on install/update so new videos appear immediately
    const files = (await fetchLiveVideoList()) || (await getVideoManifest());
    // Purge any old cache versions first
    const allKeys = await caches.keys();
    await Promise.all(allKeys.filter((k) => k !== VIDEO_CACHE_NAME).map((k) => caches.delete(k)));

    const cache = await caches.open(VIDEO_CACHE_NAME);
    await Promise.all(
      files.map(async (file) => {
        const url = getSupabaseUrl(file);
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        } catch {
          // Non-fatal — will be fetched on demand at display time
        }
      })
    );
  } catch {
    // Cache API unavailable; videos will be fetched fresh on demand
  }
}

/** Re-cache only if the cache is empty (e.g. after a browser data clear). */
async function warmCacheIfEmpty() {
  try {
    const files = await getVideoManifest();
    const cache = await caches.open(VIDEO_CACHE_NAME);
    const firstUrl = getSupabaseUrl(files[0]);
    const hit = await cache.match(firstUrl);
    if (!hit) await cacheAllVideos();
  } catch {
    // Ignore
  }
}

let activeTabId = null;
let activeWindowId = null;
let segmentStart = null; // Timestamp when current tracking segment started
let activeDomain = null;
const DEFAULT_CAT_VIDEO_FILE = 'cat-curious.mp4';
const TRACKING_STATE_KEY = 'trackingState';

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await init();
  // Re-download all videos on fresh install or version update
  if (details.reason === 'install' || details.reason === 'update') {
    cacheAllVideos();
  }
});
chrome.runtime.onStartup.addListener(async () => {
  await init();
  warmCacheIfEmpty(); // Re-cache only if browser data was cleared
});

async function init() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({
      settings: {
        defaultLimit: 30 * 60 * 1000, // 30 minutes
        siteLimits: {},
        excludedSites: [],
        enabled: true,
        catLingerMinutes: 2,
        catVideoFile: DEFAULT_CAT_VIDEO_FILE,
        trackedSitesOnly: false,
        randomCatVideo: false
      },
      siteTime: {},
      lastReset: new Date().toDateString(),
      snoozed: {}
    });
  } else {
    // Always merge defaults so any newly-added settings field is present for
    // existing users without needing per-field migration guards.
    await chrome.storage.local.set({
      settings: {
        defaultLimit: 30 * 60 * 1000,
        catLingerMinutes: 2,
        catVideoFile: DEFAULT_CAT_VIDEO_FILE,
        trackedSitesOnly: false,
        randomCatVideo: false,
        ...settings
      }
    });
  }

  // Alarm fires every minute to flush time and check limits
  chrome.alarms.clearAll(() => {
    chrome.alarms.create('tick', { periodInMinutes: 1 });
  });

  // Detect currently active tab on startup
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    activeTabId = tab.id;
    activeWindowId = tab.windowId;
    activeDomain = extractDomainFromUrl(tab.url);
    segmentStart = Date.now();
    await persistTrackingState();
  }
}

// ─── Alarm tick ───────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick') {
    await flush();
    await checkAndNotify();
  }
});

// ─── Tab / window events ──────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await flush();
  activeTabId = tabId;
  activeWindowId = windowId;
  activeDomain = await getDomainForTab(tabId);
  segmentStart = Date.now();
  await persistTrackingState();
  // Immediately check when switching tabs (catches already-over-limit sites)
  await checkAndNotify();
  // New tab / in-flight load: domain can be null briefly; re-check when URL exists
  scheduleCheckOverLimitForTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (activeTabId == null) {
    const restored = await ensureActiveTrackingContext();
    if (!restored) return;
  }

  if (tabId !== activeTabId) return;

  // URL committed — important for duplicate tabs so we do not miss checkAndNotify
  // when activation ran before the navigation URL was available.
  if (changeInfo.url) {
    const domain = extractDomainFromUrl(changeInfo.url);
    if (domain) {
      activeDomain = domain;
      await persistTrackingState();
      await checkAndNotify();
    }
  }

  if (changeInfo.status === 'loading') {
    await flush();
    segmentStart = Date.now();
    await persistTrackingState();
    return;
  }

  if (changeInfo.status !== 'complete') return;

  const nextDomain = await getDomainForTab(tabId);
  if (nextDomain) activeDomain = nextDomain;
  await persistTrackingState();
  await checkAndNotify();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flush();
  activeTabId = null;
  activeWindowId = null;
  activeDomain = null;
  segmentStart = null;
  await persistTrackingState();

  // Closing the active tab focuses another tab before the next onActivated in some cases.
  try {
    const [next] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!next?.id || !next.url || !/^https?:\/\//.test(next.url)) return;
    activeTabId = next.id;
    activeWindowId = next.windowId;
    activeDomain = extractDomainFromUrl(next.url);
    segmentStart = Date.now();
    await persistTrackingState();
    await checkAndNotify();
    scheduleCheckOverLimitForTab(next.id);
  } catch {
    // onActivated will restore.
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — pause tracking
    await flush();
    segmentStart = null;
    await persistTrackingState();
  } else {
    // Browser gained focus — resume tracking
    activeWindowId = windowId;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) {
      await flush();
      activeTabId = tab.id;
      activeDomain = extractDomainFromUrl(tab.url);
      segmentStart = Date.now();
      await persistTrackingState();
    }
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/** Save elapsed time since segmentStart to storage, then reset segmentStart. */
async function flush() {
  if (!activeTabId || !segmentStart) {
    const restored = await ensureActiveTrackingContext();
    if (!restored) return;
  }

  // Re-read activeDomain after a potential context restore to avoid attributing
  // time to a stale domain.
  const domain = activeDomain || await getActiveDomain();
  if (!domain) return;
  if (!segmentStart) return;

  const elapsed = Date.now() - segmentStart;
  segmentStart = Date.now();
  await persistTrackingState();

  const { siteTime = {}, lastReset, settings = {} } = await chrome.storage.local.get([
    'siteTime',
    'lastReset',
    'settings'
  ]);

  // Daily reset
  const today = new Date().toDateString();
  if (lastReset !== today) {
    await chrome.storage.local.set({ siteTime: {}, snoozed: {}, lastReset: today });
    segmentStart = Date.now();
    return;
  }

  // Skip tracking excluded sites entirely
  if (isExcludedDomain(domain, settings.excludedSites)) {
    segmentStart = Date.now();
    await persistTrackingState();
    return;
  }

  if (settings.trackedSitesOnly === true && !hasExplicitSiteLimit(domain, settings)) {
    segmentStart = Date.now();
    await persistTrackingState();
    return;
  }

  siteTime[domain] = (siteTime[domain] || 0) + elapsed;
  await chrome.storage.local.set({ siteTime });
}

/** Check if the active domain has exceeded its limit and notify the tab. */
async function checkAndNotify() {
  if (!activeTabId) {
    const restored = await ensureActiveTrackingContext();
    if (!restored) return;
  }

  const domain = activeDomain || await getActiveDomain();
  if (!domain) return;

  const { siteTime = {}, settings = {}, snoozed = {} } = await chrome.storage.local.get([
    'siteTime', 'settings', 'snoozed'
  ]);

  if (!settings.enabled) return;
  if (isExcludedDomain(domain, settings.excludedSites)) return;

  if (settings.trackedSitesOnly === true && !hasExplicitSiteLimit(domain, settings)) return;

  const timeSpent = siteTime[domain] || 0;
  const limit = getDomainLimit(domain, settings);

  if (limit === 0) return; // 0 = disabled for this site

  // Snoozed?
  if (snoozed[domain] && Date.now() < snoozed[domain]) return;

  if (timeSpent >= limit) {
    const payload = {
      type: 'SHOW_CAT',
      domain,
      timeSpent,
      limit,
      lingerMs: getCatLingerMs(settings),
      videoFile: await resolveCatVideoFileForBreak(settings)
    };

    let sent = await trySendToTab(activeTabId, payload);
    if (!sent) {
      const injected = await ensureTabHasContent(activeTabId);
      if (injected) {
        for (let attempt = 0; attempt < 8 && !sent; attempt += 1) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 120));
          sent = await trySendToTab(activeTabId, payload);
        }
      }
    }
  }
}

/** Re-run limit check shortly after tab switch — domain can be unknown until navigation settles. */
function scheduleCheckOverLimitForTab(tabId) {
  const delays = [150, 450, 1400];
  delays.forEach((delayMs) => {
    setTimeout(async () => {
      try {
        if (activeTabId !== tabId) return;
        const domain = await getDomainForTab(tabId);
        if (!domain) return;
        activeDomain = domain;
        await persistTrackingState();
        await checkAndNotify();
      } catch {
        // Ignore — e.g. tab closed.
      }
    }, delayMs);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomainLimit(domain, settings) {
  const siteLimits = settings.siteLimits || {};
  if (domain in siteLimits) return siteLimits[domain];
  const alt = `www.${domain}`;
  if (alt in siteLimits) return siteLimits[alt];
  if (settings.trackedSitesOnly === true) return 0;
  return settings.defaultLimit ?? 30 * 60 * 1000;
}

function hasExplicitSiteLimit(domain, settings) {
  if (!domain) return false;
  const siteLimits = settings.siteLimits || {};
  if (Object.prototype.hasOwnProperty.call(siteLimits, domain)) return true;
  const altKey = `www.${domain}`;
  if (Object.prototype.hasOwnProperty.call(siteLimits, altKey)) return true;
  const norm = normalizeDomain(domain);
  return Object.keys(siteLimits).some((key) => normalizeDomain(key) === norm);
}

function getCatLingerMs(settings) {
  const minutes = Number(settings.catLingerMinutes ?? 2);
  return Math.max(0.1, Number.isFinite(minutes) ? minutes : 2) * 60 * 1000;
}

async function resolveCatVideoFileForBreak(settings) {
  const files = await getVideoManifest();
  if (settings.randomCatVideo === true) {
    const i = Math.floor(Math.random() * files.length);
    return files[i] || DEFAULT_CAT_VIDEO_FILE;
  }
  const f = normalizeVideoFile(settings.catVideoFile || DEFAULT_CAT_VIDEO_FILE);
  return files.includes(f) ? f : DEFAULT_CAT_VIDEO_FILE;
}

function normalizeDomain(domain) {
  if (!domain) return null;
  return domain.replace(/^www\./i, '').toLowerCase();
}

function normalizeDomainsList(list) {
  return (list || [])
    .map((d) => normalizeDomain(d))
    .filter(Boolean);
}

function isExcludedDomain(domain, excludedList) {
  const normalized = normalizeDomainsList(excludedList);
  return normalized.some((ex) => domain === ex || domain.endsWith(`.${ex}`));
}

async function getActiveDomain() {
  if (!activeTabId) return null;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    return extractDomainFromUrl(tab.url);
  } catch {
    return null;
  }
}

async function ensureActiveTrackingContext() {
  try {
    await hydrateTrackingState();
    if (activeTabId && segmentStart) return true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    if (!tab.url || !/^https?:\/\//.test(tab.url)) return false;

    activeTabId = tab.id;
    activeWindowId = tab.windowId;
    activeDomain = extractDomainFromUrl(tab.url);
    if (!segmentStart) segmentStart = Date.now();
    await persistTrackingState();
    return true;
  } catch {
    return false;
  }
}

async function hydrateTrackingState() {
  if (activeTabId || segmentStart) return;
  try {
    const { [TRACKING_STATE_KEY]: trackingState } = await chrome.storage.session.get(TRACKING_STATE_KEY);
    if (!trackingState) return;
    activeTabId = trackingState.activeTabId ?? null;
    activeWindowId = trackingState.activeWindowId ?? null;
    activeDomain = trackingState.activeDomain ?? null;
    segmentStart = trackingState.segmentStart ?? null;
  } catch {
    // Ignore session restore failures.
  }
}

async function persistTrackingState() {
  try {
    await chrome.storage.session.set({
      [TRACKING_STATE_KEY]: {
        activeTabId,
        activeWindowId,
        activeDomain,
        segmentStart
      }
    });
  } catch {
    // Ignore session persistence failures.
  }
}

function extractDomainFromUrl(urlValue) {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol === 'chrome:' || url.protocol === 'about:' || url.protocol === 'chrome-extension:') return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

async function getDomainForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return extractDomainFromUrl(tab?.url);
  } catch {
    return null;
  }
}

async function trySendToTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch {
    return false;
  }
}

async function ensureTabHasContent(tabId) {
  const alreadyReady = await pingTab(tabId);
  if (alreadyReady) return true;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    return true;
  } catch {
    return false;
  }
}

async function pingTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'FCB_PING' });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(() => sendResponse(null));
  return true; // Keep message channel open for async
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'SNOOZE': {
      const { snoozed = {} } = await chrome.storage.local.get('snoozed');
      snoozed[msg.domain] = Date.now() + msg.duration;
      await chrome.storage.local.set({ snoozed });
      return { ok: true };
    }
    case 'RESET_SITE': {
      const { siteTime = {} } = await chrome.storage.local.get(['siteTime']);
      delete siteTime[msg.domain];
      await chrome.storage.local.set({ siteTime });
      return { ok: true };
    }
    case 'RESET_ALL': {
      await chrome.storage.local.set({ siteTime: {}, snoozed: {}, lastReset: new Date().toDateString() });
      return { ok: true };
    }
    case 'GET_STATS': {
      return chrome.storage.local.get(['siteTime', 'settings', 'snoozed', 'lastReset']);
    }
    case 'SAVE_SETTINGS': {
      const normalizedSiteLimits = {};
      Object.entries(msg.settings.siteLimits || {}).forEach(([domain, limit]) => {
        const norm = normalizeDomain(domain);
        if (norm) normalizedSiteLimits[norm] = limit;
      });
      const normalizedExcluded = normalizeDomainsList(msg.settings.excludedSites);
      const dedupExcluded = Array.from(new Set(normalizedExcluded));

      const nextSettings = {
        ...msg.settings,
        siteLimits: normalizedSiteLimits,
        excludedSites: dedupExcluded
      };

      // Clear snoozed gates so new limits/settings apply immediately.
      await chrome.storage.local.set({ settings: nextSettings, snoozed: {} });
      return { ok: true };
    }
    case 'GET_CAT_VIDEO': {
      try {
        // Normalize so legacy 'assets/cat-*.mp4' keys still resolve correctly
        const url = getSupabaseUrl(msg.file);
        const cache = await caches.open(VIDEO_CACHE_NAME);
        let res = await cache.match(url);
        if (!res) {
          // Cache miss — fetch from Supabase and store for next time
          res = await fetch(url);
          if (res.ok) await cache.put(url, res.clone());
        }
        if (!res?.ok) return { ok: false };
        const buffer = await res.arrayBuffer();
        return { ok: true, buffer };
      } catch {
        return { ok: false };
      }
    }
    case 'GET_CAT_VIDEOS_LIST': {
      const files = await getVideoManifest();
      return { ok: true, files };
    }
    case 'TAB_MUTE_FOR_BREAK': {
      const tabId = sender.tab?.id;
      if (tabId == null) return { ok: false };
      if (msg.action === 'mute') {
        const tab = await chrome.tabs.get(tabId);
        const wasMuted = tab.mutedInfo?.muted ?? false;
        if (!wasMuted) {
          await chrome.tabs.update(tabId, { muted: true });
          return { ok: true, weMuted: true };
        }
        return { ok: true, weMuted: false };
      }
      if (msg.action === 'unmute') {
        await chrome.tabs.update(tabId, { muted: false });
        return { ok: true };
      }
      return { ok: false };
    }
    default:
      return null;
  }
}
