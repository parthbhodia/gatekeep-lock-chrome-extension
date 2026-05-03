const DEFAULT_VIDEO_FILE = 'snaptik_7313952845961645314_v3.mp4';
const DEFAULT_LIMIT_CHIPS = [15, 30, 45, 60, 90, 120];
const CAT_LINGER_CHIPS = [0.2, 0.5, 1, 2, 5, 10];
const CAT_VIDEOS = [
  { file: 'YTDown_YouTube_Sad-Cat-Meowing-Meme-Green-Screen-sadcat_Media_2ND0G6nIUKY_001_1080p.mp4', label: 'Sad Cat' },
  { file: 'snaptik_7330929514878356741_v3.mp4', label: 'Playful Cat' },
  { file: 'snaptik_7313952845961645314_v3.mp4', label: 'Curious Cat' },
  { file: 'snaptik_7632449998856178965_v3.mp4', label: 'Chill Cat' }
];

let settings = {
  defaultLimit: 30 * 60 * 1000,
  siteLimits: {},
  excludedSites: [],
  enabled: true,
  catLingerMinutes: 2,
  catVideoFile: DEFAULT_VIDEO_FILE
};
let siteTime = {};
let saveTimeout = null;
let isSaving = false;

async function load() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (data?.settings) settings = { ...settings, ...data.settings };
    if (data?.siteTime) siteTime = data.siteTime;
  } catch {
    // Ignore first-open worker race.
  }
  enforceKnownVideo();
  render();
  bindEvents();
  refreshShooCatState();
  initReviewBanner();
}

function enforceKnownVideo() {
  const exists = CAT_VIDEOS.some((video) => video.file === settings.catVideoFile);
  if (!exists) settings.catVideoFile = DEFAULT_VIDEO_FILE;
}

function render() {
  document.getElementById('enabled-toggle').checked = settings.enabled !== false;
  document.getElementById('default-limit').value = Math.max(1, Math.round((settings.defaultLimit || (30 * 60 * 1000)) / 60000));
  document.getElementById('cat-linger').value = Math.max(0.1, Number(settings.catLingerMinutes ?? 2));
  document.getElementById('cat-video').value = settings.catVideoFile;

  renderDefaultLimitChips();
  renderCatLingerChips();
  renderStats();
  renderSiteLimits();
  renderExcludedSites();
  renderVideoGrid();
}

function renderDefaultLimitChips() {
  renderChips(
    document.getElementById('default-limit-chips'),
    DEFAULT_LIMIT_CHIPS,
    Math.max(1, Math.round((settings.defaultLimit || (30 * 60 * 1000)) / 60000)),
    'm',
    (value) => {
      settings.defaultLimit = value * 60 * 1000;
      document.getElementById('default-limit').value = value;
      renderDefaultLimitChips();
      queueSave();
    }
  );
}

function renderCatLingerChips() {
  renderChips(
    document.getElementById('cat-linger-chips'),
    CAT_LINGER_CHIPS,
    Number(settings.catLingerMinutes ?? 2),
    'm',
    (value) => {
      settings.catLingerMinutes = value;
      document.getElementById('cat-linger').value = value;
      renderCatLingerChips();
      queueSave();
    }
  );
}

function renderChips(container, values, activeValue, suffix, onClick) {
  container.innerHTML = values.map((value) => {
    const isActive = Math.abs(Number(activeValue) - Number(value)) < 0.001;
    return `<button type="button" class="chip ${isActive ? 'is-active' : ''}" data-value="${value}">${value}${suffix}</button>`;
  }).join('');

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => onClick(Number(chip.dataset.value)));
  });
}

function renderStats() {
  const el = document.getElementById('stats-list');
  const entries = Object.entries(siteTime).sort((a, b) => b[1] - a[1]).slice(0, 12);

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty">No activity recorded today</div>';
    return;
  }

  const maxMs = entries[0][1];
  el.innerHTML = entries.map(([domain, ms]) => {
    const limit = getDomainLimitMs(domain);
    const over = limit > 0 && ms >= limit;
    const pct = Math.min(100, (ms / Math.max(maxMs, 1)) * 100);
    return `
      <div class="stat-item">
        <div class="stat-row">
          <span class="stat-domain" title="${domain}">${domain}</span>
          <span class="stat-time ${over ? 'over' : ''}">${fmtMs(ms)}${over ? ' ⚠' : ''}</span>
        </div>
        <div class="stat-bar"><div class="stat-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

function renderSiteLimits() {
  const el = document.getElementById('site-limits');
  const entries = Object.entries(settings.siteLimits || {});

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty">No per-site limits set</div>';
    return;
  }

  el.innerHTML = entries.map(([domain, ms]) => `
    <div class="site-item">
      <span class="site-item-domain" title="${domain}">${domain}</span>
      <span class="site-item-limit">${Math.round(ms / 60000)}m</span>
      <button class="site-item-rm" data-d="${domain}" type="button" title="Remove">✕</button>
    </div>`).join('');

  el.querySelectorAll('.site-item-rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      delete settings.siteLimits[btn.dataset.d];
      renderSiteLimits();
      queueSave();
    });
  });
}

function renderExcludedSites() {
  const el = document.getElementById('excluded-sites');
  const sites = settings.excludedSites || [];

  if (sites.length === 0) {
    el.innerHTML = '<div class="empty">No sites excluded</div>';
    return;
  }

  el.innerHTML = sites.map((domain) => `
    <div class="site-item">
      <span class="site-item-domain" title="${domain}">${domain}</span>
      <span class="site-item-limit" style="color:#2f995f">Excluded</span>
      <button class="site-item-rm" data-d="${domain}" type="button" title="Remove">✕</button>
    </div>`).join('');

  el.querySelectorAll('.site-item-rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.excludedSites = (settings.excludedSites || []).filter((d) => d !== btn.dataset.d);
      renderExcludedSites();
      queueSave();
    });
  });
}

async function excludeCurrentSite() {
  const btn = document.getElementById('exclude-current-btn');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
      btn.textContent = 'No active site found';
      setTimeout(() => { btn.textContent = '＋ Exclude current site'; }, 2000);
      return;
    }
    const domain = new URL(tab.url).hostname;
    if (!(settings.excludedSites || []).includes(domain)) {
      settings.excludedSites = [...(settings.excludedSites || []), domain];
      renderExcludedSites();
      queueSave();
    }
    btn.textContent = `✓ ${domain} excluded`;
    setTimeout(() => { btn.textContent = '＋ Exclude current site'; }, 2000);
  } catch {
    btn.textContent = 'Could not detect site';
    setTimeout(() => { btn.textContent = '＋ Exclude current site'; }, 2000);
  }
}

function renderVideoGrid() {
  const grid = document.getElementById('cat-video-grid');
  grid.innerHTML = CAT_VIDEOS.map((video) => {
    const selected = video.file === settings.catVideoFile;
    const src = chrome.runtime.getURL(video.file);
    return `
      <button class="video-card ${selected ? 'is-selected' : ''}" type="button" data-video="${video.file}">
        <video class="video-thumb" src="${src}" muted loop playsinline preload="metadata"></video>
        <span class="video-label">${video.label}</span>
      </button>`;
  }).join('');

  grid.querySelectorAll('.video-card').forEach((card) => {
    const videoEl = card.querySelector('.video-thumb');
    card.addEventListener('mouseenter', () => {
      videoEl.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => {
      videoEl.pause();
      videoEl.currentTime = 0;
    });
    card.addEventListener('click', () => {
      settings.catVideoFile = card.dataset.video;
      document.getElementById('cat-video').value = card.dataset.video;
      renderVideoGrid();
      queueSave();
    });
  });
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  document.getElementById('enabled-toggle').addEventListener('change', (e) => {
    settings.enabled = e.target.checked;
    queueSave();
  });

  document.getElementById('default-limit').addEventListener('input', (e) => {
    const value = Math.max(1, parseInt(e.target.value, 10) || 1);
    settings.defaultLimit = value * 60 * 1000;
    renderDefaultLimitChips();
    queueSave();
  });

  document.getElementById('cat-linger').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    settings.catLingerMinutes = Math.max(0.1, Number.isFinite(value) ? value : 2);
    renderCatLingerChips();
    queueSave();
  });

  document.getElementById('add-btn').addEventListener('click', () => {
    const domain = cleanDomain(document.getElementById('add-domain').value);
    const mins = parseInt(document.getElementById('add-limit').value, 10);
    if (!domain || Number.isNaN(mins) || mins < 1) return;

    if (!settings.siteLimits) settings.siteLimits = {};
    settings.siteLimits[domain] = mins * 60 * 1000;
    document.getElementById('add-domain').value = '';
    document.getElementById('add-limit').value = '';
    renderSiteLimits();
    queueSave();
  });

  document.getElementById('exclude-current-btn').addEventListener('click', excludeCurrentSite);
  document.getElementById('preview-cat-btn').addEventListener('click', previewCatNow);
  document.getElementById('shoo-cat-btn').addEventListener('click', shooCatAway);
  document.getElementById('shoo-cat-btn-settings').addEventListener('click', shooCatAway);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushPendingSave();
    }
  });
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === tabId);
  });
  refreshShooCatState();
}

function queueSave() {
  setSaveStatus('Saving...', 'is-saving');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveSettings, 280);
}

function flushPendingSave() {
  if (!saveTimeout) return;
  clearTimeout(saveTimeout);
  saveTimeout = null;
  saveSettings();
}

async function saveSettings() {
  saveTimeout = null;
  if (isSaving) return;
  isSaving = true;
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    setSaveStatus('Saved', 'is-saved');
  } catch {
    setSaveStatus('Save failed', '');
  } finally {
    isSaving = false;
  }
}

function setSaveStatus(text, stateClass) {
  const indicator = document.getElementById('save-indicator');
  indicator.textContent = text;
  indicator.classList.remove('is-saving', 'is-saved');
  if (stateClass) indicator.classList.add(stateClass);
}

async function previewCatNow() {
  flushPendingSave();
  const msg = document.getElementById('preview-msg');
  msg.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      msg.textContent = 'Open a normal website tab first.';
      return;
    }

    const domain = new URL(tab.url).hostname;
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_CAT',
      domain,
      timeSpent: 31 * 60 * 1000,
      limit: 30 * 60 * 1000,
      lingerMs: Math.max(0.1, Number(settings.catLingerMinutes ?? 2)) * 60 * 1000,
      videoFile: settings.catVideoFile,
      force: true
    });
    msg.textContent = 'Cat sent to this tab.';
    setTimeout(refreshShooCatState, 400);
  } catch {
    msg.textContent = 'Reload this page, then try again.';
  }
}

async function shooCatAway() {
  const msg = document.getElementById('preview-msg');
  msg.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      msg.textContent = 'Open a normal website tab first.';
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SHOO_CAT' });
    if (response?.dismissed) {
      msg.textContent = 'Cat shooed away.';
    } else {
      msg.textContent = 'No active cat on this tab.';
    }
  } catch {
    msg.textContent = 'Reload this page, then try again.';
  } finally {
    refreshShooCatState();
  }
}

async function refreshShooCatState() {
  const buttons = [...document.querySelectorAll('.shoo-cat-btn')];
  if (buttons.length === 0) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      buttons.forEach((button) => button.classList.add('is-hidden'));
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CAT_STATE' });
    buttons.forEach((button) => button.classList.toggle('is-hidden', !response?.active));
  } catch {
    buttons.forEach((button) => button.classList.add('is-hidden'));
  }
}

function getDomainLimitMs(domain) {
  const siteLimits = settings.siteLimits || {};
  return domain in siteLimits ? siteLimits[domain] : (settings.defaultLimit || 30 * 60 * 1000);
}

function fmtMs(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function cleanDomain(raw) {
  return raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

function initReviewBanner() {
  if (localStorage.getItem('cat_break_review_dismissed')) return;
  const banner = document.getElementById('review-banner');
  if (!banner) return;
  banner.classList.add('is-visible');
  document.getElementById('review-link').href =
    `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
  document.getElementById('review-dismiss').addEventListener('click', () => {
    localStorage.setItem('cat_break_review_dismissed', '1');
    banner.classList.remove('is-visible');
  });
}

load();
