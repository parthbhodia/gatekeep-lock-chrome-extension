const DEFAULT_VIDEO_FILE = 'snaptik_7313952845961645314_v3.mp4';
const LIMIT_CHIPS = [15, 30, 45, 60, 90, 120];
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
let toastTimer = null;
let defaultLimitToastTimer = null;
let catLingerToastTimer = null;

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
  renderPerSiteChips();
  renderSiteLimits();
  renderExcludedSites();
  renderVideoGrid();
}

function renderDefaultLimitChips() {
  const container = document.getElementById('default-limit-chips');
  const activeVal = Math.max(1, Math.round((settings.defaultLimit || (30 * 60 * 1000)) / 60000));

  renderChips(
    container,
    LIMIT_CHIPS,
    activeVal,
    'm',
    (value) => {
      settings.defaultLimit = value * 60 * 1000;
      document.getElementById('default-limit').value = value;
      renderDefaultLimitChips();
      queueSave();
      showToast(`Default limit set to ${value}m`, 'success');
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
    el.classList.remove('is-scrollable');
    return;
  }

  el.classList.toggle('is-scrollable', entries.length > 5);
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
  const excluded = (settings.excludedSites || []).map(cleanDomain).filter(Boolean);

  // Build display entries without mutating settings.siteLimits — only clean up
  // orphaned entries that have an empty key.
  const entries = [];
  const cleanedLimits = {};

  Object.entries(settings.siteLimits || {}).forEach(([domain, ms]) => {
    const d = cleanDomain(domain);
    if (!d) return; // drop entries with unresolvable keys
    const isExcluded = excluded.some((ex) => d === ex || d.endsWith(`.${ex}`));
    if (isExcluded) return; // skip excluded, but don't delete — exclusion handles that
    cleanedLimits[d] = ms;
    entries.push([d, ms]);
  });

  // Only update settings if keys were actually normalised (e.g. www. stripped).
  if (Object.keys(cleanedLimits).join() !== Object.keys(settings.siteLimits || {}).join()) {
    settings.siteLimits = cleanedLimits;
  }

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty">No site limits set</div>';
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
      showToast(`Removed ${btn.dataset.d}`, 'info');
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
      showToast(`Removed ${btn.dataset.d}`, 'info');
      queueSave();
    });
  });
}

function renderPerSiteChips() {
  const row = document.getElementById('per-site-chips');
  if (!row) return;
  const current = Number(document.getElementById('add-limit').value) || 0;
  row.innerHTML = LIMIT_CHIPS.map((value) => {
    const isActive = Math.abs(current - value) < 0.001;
    return `<button type="button" class="chip ${isActive ? 'is-active' : ''}" data-value="${value}">${value}m</button>`;
  }).join('');
  row.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('add-limit').value = Number(chip.dataset.value);
      renderPerSiteChips();
    });
  });
}

function addExcludedDomainFromInput() {
  const input = document.getElementById('exclude-domain');
  if (!input) return;
  const rawDomain = input.value;
  const domain = cleanDomain(rawDomain);
  if (!rawDomain.trim()) { showToast('Enter a valid site name to exclude (e.g., youtube.com)', 'error'); return; }
  if (!domain) { showToast('Enter a valid site name to exclude (e.g., youtube.com)', 'error'); return; }
  const nextExcluded = (settings.excludedSites || []).filter((d) => !domainsMatch(d, domain));
  nextExcluded.push(domain);
  settings.excludedSites = nextExcluded;
  const hadSiteLimit = Object.keys(settings.siteLimits || {}).some((d) => domainsMatch(d, domain));
  removeMatchingSiteLimits(domain);
  renderExcludedSites();
  renderSiteLimits();
  queueSave();
  // Clear any existing time for this domain so exclusion takes effect immediately
  chrome.runtime.sendMessage({ type: 'RESET_SITE', domain }).catch(() => {});
  showToast(
    `Excluded ${domain}${hadSiteLimit ? ' and removed its site limit' : ''}`,
    'success'
  );
  input.value = '';
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
    const mins = parseInt(e.target.value, 10);
    clearTimeout(defaultLimitToastTimer);
    if (Number.isNaN(mins) || mins < 1) {
      defaultLimitToastTimer = setTimeout(() => {
        showToast('Enter minutes (>=1)', 'error');
        // Restore input to the last saved valid value so state stays consistent.
        e.target.value = Math.max(1, Math.round((settings.defaultLimit || 30 * 60 * 1000) / 60000));
      }, 700);
      return;
    }
    settings.defaultLimit = mins * 60 * 1000;
    renderDefaultLimitChips();
    queueSave();
    defaultLimitToastTimer = setTimeout(() => showToast(`Default limit set to ${mins}m`, 'success'), 700);
  });

  document.getElementById('cat-linger').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    settings.catLingerMinutes = Math.max(0.1, Number.isFinite(value) ? value : 2);
    renderCatLingerChips();
    queueSave();
    clearTimeout(catLingerToastTimer);
    catLingerToastTimer = setTimeout(() => showToast(`Cat linger set to ${settings.catLingerMinutes}m`, 'success'), 700);
  });

  document.getElementById('add-btn').addEventListener('click', () => {
    const rawDomain = document.getElementById('add-domain').value;
    const domain = cleanDomain(rawDomain);
    const mins = parseInt(document.getElementById('add-limit').value, 10);
    if (!rawDomain.trim()) { showToast('Enter a valid site name (e.g., youtube.com)', 'error'); return; }
    if (!domain) { showToast('Enter a valid site name (e.g., youtube.com)', 'error'); return; }
    if (Number.isNaN(mins) || mins < 1) { showToast('Enter minutes (>=1)', 'error'); return; }
    if ((settings.excludedSites || []).some((d) => domainsMatch(d, domain))) {
      showToast('This site is excluded. Remove it from Excluded first.', 'error');
      return;
    }

    if (!settings.siteLimits) settings.siteLimits = {};
    // Remove matching site limits variants
    removeMatchingSiteLimits(domain);
    settings.siteLimits[domain] = mins * 60 * 1000;
    document.getElementById('add-domain').value = '';
    document.getElementById('add-limit').value = '';
    renderSiteLimits();
    showToast(`Added ${domain} (${mins}m)`, 'success');
    queueSave();
  });

  document.getElementById('add-domain').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('add-btn').click();
    }
  });
  document.getElementById('add-limit').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('add-btn').click();
    }
  });
  document.getElementById('add-limit').addEventListener('input', () => renderPerSiteChips());

  document.getElementById('exclude-add-btn').addEventListener('click', () => {
    addExcludedDomainFromInput();
  });
  document.getElementById('exclude-domain').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExcludedDomainFromInput();
    }
  });

  document.getElementById('reset-all-btn').addEventListener('click', resetAllStats);
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

function setSaveStatus(_text, _stateClass) {
  // Save indicator is intentionally hidden; saves confirmed via toast.
}

function showToast(text, variant = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = `toast ${variant} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, 1800);
}

function domainsMatch(a, b) {
  const ca = cleanDomain(a);
  const cb = cleanDomain(b);
  if (!ca || !cb) return false;
  return (
    ca === cb ||
    ca === `www.${cb}` ||
    cb === `www.${ca}` ||
    ca.endsWith(`.${cb}`) ||
    cb.endsWith(`.${ca}`)
  );
}

function removeMatchingSiteLimits(target) {
  const cleaned = {};
  Object.entries(settings.siteLimits || {}).forEach(([d, v]) => {
    if (!domainsMatch(d, target)) cleaned[d] = v;
  });
  settings.siteLimits = cleaned;
}

async function resetAllStats() {
  try {
    await chrome.runtime.sendMessage({ type: 'RESET_ALL' });
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (data?.siteTime) siteTime = data.siteTime;
    renderStats();
    showToast('Stats reset for today', 'info');
  } catch {
    showToast('Reset failed', 'error');
  }
}

async function previewCatNow() {
  flushPendingSave();
  const msg = document.getElementById('preview-msg');
  msg.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      msg.textContent = 'Open a normal website tab first.';
      showToast('Open a site tab first', 'error');
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
    showToast('Cat sent to this tab', 'success');
    setTimeout(refreshShooCatState, 400);
  } catch {
    msg.textContent = 'Reload this page, then try again.';
    showToast('Reload this page, then try again', 'error');
  }
}

async function shooCatAway() {
  const msg = document.getElementById('preview-msg');
  msg.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      msg.textContent = 'Open a normal website tab first.';
      showToast('Open a site tab first', 'error');
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SHOO_CAT' });
    if (response?.dismissed) {
      msg.textContent = 'Cat shooed away.';
      showToast('Cat shooed away', 'success');
    } else {
      msg.textContent = 'No active cat on this tab.';
      showToast('No active cat on this tab', 'info');
    }
  } catch {
    msg.textContent = 'Reload this page, then try again.';
    showToast('Reload this page, then try again', 'error');
  } finally {
    refreshShooCatState();
  }
}

async function refreshShooCatState() {
  const buttons = [...document.querySelectorAll('.shoo-cat-btn')];
  if (buttons.length === 0) return;
  const quickSection = document.getElementById('quick-action-section');
  // Hide by default; show only when active cat exists
  buttons.forEach((button) => button.classList.add('is-hidden'));
  if (quickSection) quickSection.classList.add('is-hidden');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CAT_STATE' });
    if (response?.active) {
      buttons.forEach((button) => button.classList.remove('is-hidden'));
      if (quickSection) quickSection.classList.remove('is-hidden');
    }
  } catch {
    // keep hidden on errors
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

function isValidDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  const withoutProto = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const domain = withoutProto.replace(/\/.*$/, '');
  const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/; // requires at least one dot and valid labels
  return domainRegex.test(domain);
}

function cleanDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  const withoutProto = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const domain = withoutProto.replace(/\/.*$/, '');
  return isValidDomain(domain) ? domain : '';
}

function initReviewBanner() {
  if (localStorage.getItem('cat_break_review_dismissed')) return;
  const banner = document.getElementById('review-banner');
  if (!banner) return;
  banner.classList.add('is-visible');
  document.getElementById('review-link').href =
    'https://chromewebstore.google.com/detail/cat-break/lnmigkmapjkmfpnjlhnmdkihpnlihagh/reviews';
  document.getElementById('review-dismiss').addEventListener('click', () => {
    localStorage.setItem('cat_break_review_dismissed', '1');
    banner.classList.remove('is-visible');
  });
}

load();
