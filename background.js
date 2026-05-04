// background.js — Cat Break service worker
// Tracks active tab time per domain and triggers the cat when limits are hit.

let activeTabId = null;
let activeWindowId = null;
let segmentStart = null; // Timestamp when current tracking segment started
let activeDomain = null;
const DEFAULT_CAT_VIDEO_FILE = 'snaptik_7313952845961645314_v3.mp4';
const TRACKING_STATE_KEY = 'trackingState';

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

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
        catVideoFile: DEFAULT_CAT_VIDEO_FILE
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
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (activeTabId == null) {
    const restored = await ensureActiveTrackingContext();
    if (!restored) return;
  }

  if (tabId !== activeTabId) return;

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
      videoFile: settings.catVideoFile
    };

    const sent = await trySendToTab(activeTabId, payload);
    if (!sent) {
      const injected = await ensureTabHasContent(activeTabId);
      if (injected) {
        await trySendToTab(activeTabId, payload);
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomainLimit(domain, settings) {
  const siteLimits = settings.siteLimits || {};
  if (domain in siteLimits) return siteLimits[domain];
  const alt = `www.${domain}`;
  if (alt in siteLimits) return siteLimits[alt];
  return settings.defaultLimit ?? 30 * 60 * 1000;
}

function getCatLingerMs(settings) {
  const minutes = Number(settings.catLingerMinutes ?? 2);
  return Math.max(0.1, Number.isFinite(minutes) ? minutes : 2) * 60 * 1000;
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
    default:
      return null;
  }
}
