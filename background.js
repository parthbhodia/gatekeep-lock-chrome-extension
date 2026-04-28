// background.js — Fat Cat Break service worker
// Tracks active tab time per domain and triggers the cat when limits are hit.

let activeTabId = null;
let activeWindowId = null;
let segmentStart = null; // Timestamp when current tracking segment started
const DEFAULT_CAT_VIDEO_FILE = 'snaptik_7313952845961645314_v3.mp4';

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
        enabled: true,
        catLingerMinutes: 2,
        catVideoFile: DEFAULT_CAT_VIDEO_FILE
      },
      siteTime: {},
      lastReset: new Date().toDateString(),
      snoozed: {}
    });
  } else if (settings.catLingerMinutes == null || settings.catVideoFile == null) {
    await chrome.storage.local.set({
      settings: {
        ...settings,
        catLingerMinutes: settings.catLingerMinutes ?? 2,
        catVideoFile: settings.catVideoFile ?? DEFAULT_CAT_VIDEO_FILE
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
    segmentStart = Date.now();
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
  segmentStart = Date.now();
  // Immediately check when switching tabs (catches already-over-limit sites)
  await checkAndNotify();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status !== 'complete') return;
  await flush();
  segmentStart = Date.now();
  await checkAndNotify();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flush();
  activeTabId = null;
  segmentStart = null;
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — pause tracking
    await flush();
    segmentStart = null;
  } else {
    // Browser gained focus — resume tracking
    activeWindowId = windowId;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) {
      await flush();
      activeTabId = tab.id;
      segmentStart = Date.now();
    }
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/** Save elapsed time since segmentStart to storage, then reset segmentStart. */
async function flush() {
  if (!activeTabId || !segmentStart) return;

  const domain = await getActiveDomain();
  if (!domain) return;

  const elapsed = Date.now() - segmentStart;
  segmentStart = Date.now();

  const { siteTime = {}, lastReset } = await chrome.storage.local.get(['siteTime', 'lastReset']);

  // Daily reset
  const today = new Date().toDateString();
  if (lastReset !== today) {
    await chrome.storage.local.set({ siteTime: {}, snoozed: {}, lastReset: today });
    return;
  }

  siteTime[domain] = (siteTime[domain] || 0) + elapsed;
  await chrome.storage.local.set({ siteTime });
}

/** Check if the active domain has exceeded its limit and notify the tab. */
async function checkAndNotify() {
  if (!activeTabId) return;

  const domain = await getActiveDomain();
  if (!domain) return;

  const { siteTime = {}, settings = {}, snoozed = {} } = await chrome.storage.local.get([
    'siteTime', 'settings', 'snoozed'
  ]);

  if (!settings.enabled) return;

  const timeSpent = siteTime[domain] || 0;
  const limit = getDomainLimit(domain, settings);

  if (limit === 0) return; // 0 = disabled for this site

  // Snoozed?
  if (snoozed[domain] && Date.now() < snoozed[domain]) return;

  if (timeSpent >= limit) {
    try {
      await chrome.tabs.sendMessage(activeTabId, {
        type: 'SHOW_CAT',
        domain,
        timeSpent,
        limit,
        lingerMs: getCatLingerMs(settings),
        videoFile: settings.catVideoFile
      });
    } catch {
      // Content script not ready (chrome:// pages, extension pages, etc.)
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomainLimit(domain, settings) {
  const siteLimits = settings.siteLimits || {};
  if (domain in siteLimits) return siteLimits[domain];
  return settings.defaultLimit ?? 30 * 60 * 1000;
}

function getCatLingerMs(settings) {
  const minutes = Number(settings.catLingerMinutes ?? 2);
  return Math.max(0.1, Number.isFinite(minutes) ? minutes : 2) * 60 * 1000;
}

async function getActiveDomain() {
  if (!activeTabId) return null;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    if (!tab.url) return null;
    const url = new URL(tab.url);
    if (url.protocol === 'chrome:' || url.protocol === 'about:' || url.protocol === 'chrome-extension:') return null;
    return url.hostname;
  } catch {
    return null;
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
      const { siteTime = {} } = await chrome.storage.local.get('siteTime');
      delete siteTime[msg.domain];
      await chrome.storage.local.set({ siteTime });
      return { ok: true };
    }
    case 'GET_STATS': {
      return chrome.storage.local.get(['siteTime', 'settings', 'snoozed', 'lastReset']);
    }
    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ settings: msg.settings });
      return { ok: true };
    }
    default:
      return null;
  }
}
