const DEFAULT_VIDEO_FILE = 'cat-curious.mp4';
const LIMIT_CHIPS = [15, 30, 45, 60, 90];
const CAT_LINGER_CHIPS = [0.2, 0.5, 1, 2, 5];
const CAT_VIDEOS = [
  { file: 'cat-sad-meow.mp4',              label: 'Sad Cat' },
  { file: 'cat-playful.mp4',               label: 'Playful Cat' },
  { file: 'cat-curious.mp4',               label: 'Curious Cat' },
  { file: 'cat-chill.mp4',                 label: 'Chill Cat' },
  { file: 'assets/cat-morning-paws.mp4',   label: 'Morning Paws' },
  { file: 'assets/cat-elegant-steps.mp4',  label: 'Elegant Steps' },
  { file: 'assets/cat-garden-stroll.mp4',  label: 'Garden Stroll' },
  { file: 'assets/cat-alley-amble.mp4',    label: 'Alley Amble' },
  { file: 'assets/cat-window-watcher.mp4', label: 'Window Watcher' },
  { file: 'assets/cat-curious-stroll.mp4', label: 'Curious Stroll' },
  { file: 'assets/cat-lazy-stretch.mp4',   label: 'Lazy Stretch' },
  { file: 'assets/cat-street-strut.mp4',   label: 'Street Strut' },
  { file: 'assets/cat-twilight-prowl.mp4', label: 'Twilight Prowl' }
];

let settings = {
  defaultLimit: 30 * 60 * 1000,
  siteLimits: {},
  excludedSites: [],
  enabled: true,
  catLingerMinutes: 2,
  catVideoFile: DEFAULT_VIDEO_FILE,
  trackedSitesOnly: false,
  randomCatVideo: false
};
let siteTime = {};
let saveTimeout = null;
let isSaving = false;
let toastTimer = null;
let defaultLimitToastTimer = null;
let catLingerToastTimer = null;

const TOUR_STORAGE_KEY = 'catBreakTourCompleted';
let tourStepIndex = 0;

const TOUR_STEPS = [
  {
    tab: 'cat',
    title: 'Welcome',
    body: 'Four stops: default time, listed-only mode, site list, exclusions. Next shows each control.',
    targetSelector: null
  },
  {
    tab: 'cat',
    title: 'Default time limit',
    body: 'Minutes on a site before the cat. Chips or type a number.',
    targetSelector: '#tour-anchor-default-limit'
  },
  {
    tab: 'settings',
    title: 'Only listed sites',
    body: 'On: only domains in your list get timed. All others stay off the clock.',
    targetSelector: '#tour-anchor-listed-only'
  },
  {
    tab: 'settings',
    title: 'Site list',
    body: 'Domain + minutes, then Add—e.g. social sites with their own limits.',
    targetSelector: '#tour-anchor-limit-by-site',
    tourModalPlacement: 'top'
  },
  {
    tab: 'settings',
    title: 'Excluded',
    body: 'Never timed here—no cat on these sites.',
    targetSelector: '#tour-anchor-excluded',
    tourModalPlacement: 'top',
    tourScrollBlock: 'end'
  },
  {
    tab: 'settings',
    title: 'Done',
    body: 'Change anytime. Tour in the tab bar replays this.',
    targetSelector: null
  }
];

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
  await initTour();
}

function enforceKnownVideo() {
  const exists = CAT_VIDEOS.some((video) => video.file === settings.catVideoFile);
  if (!exists) settings.catVideoFile = DEFAULT_VIDEO_FILE;
}

function getCatVideoLabel(file) {
  const v = CAT_VIDEOS.find((video) => video.file === file);
  return v ? v.label : 'Cat';
}

function getCatBreakDisplayLabel() {
  if (settings.randomCatVideo === true) return 'Random';
  return getCatVideoLabel(settings.catVideoFile);
}

function pickRandomCatFileForPreview() {
  const i = Math.floor(Math.random() * CAT_VIDEOS.length);
  return CAT_VIDEOS[i].file;
}

function render() {
  document.getElementById('enabled-toggle').checked = settings.enabled !== false;
  const trackedOnly = document.getElementById('tracked-sites-only');
  if (trackedOnly) trackedOnly.checked = settings.trackedSitesOnly === true;
  const randomCat = document.getElementById('random-cat-toggle');
  if (randomCat) randomCat.checked = settings.randomCatVideo === true;
  syncDefaultLimitInputs(Math.max(1, Math.round((settings.defaultLimit || (30 * 60 * 1000)) / 60000)));
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

function syncDefaultLimitInputs(minutes) {
  const v = String(minutes);
  const main = document.getElementById('default-limit');
  const cat = document.getElementById('default-limit-cat');
  if (main) main.value = v;
  if (cat) cat.value = v;
}

function renderDefaultLimitChips() {
  const activeVal = Math.max(1, Math.round((settings.defaultLimit || (30 * 60 * 1000)) / 60000));

  const onChip = (value) => {
    settings.defaultLimit = value * 60 * 1000;
    syncDefaultLimitInputs(value);
    renderDefaultLimitChips();
    queueSave();
    showToast(`Default limit set to ${value}m`, 'success');
  };

  ['default-limit-chips', 'default-limit-chips-cat'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) renderChips(el, LIMIT_CHIPS, activeVal, 'm', onChip);
  });
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
  if (!el) return;
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
    const hint =
      settings.trackedSitesOnly === true
        ? 'Add a site below. With only-list mode on, nothing is timed until you do.'
        : 'No site limits set';
    el.innerHTML = `<div class="empty">${hint}</div>`;
    return;
  }

  const catLabel = getCatBreakDisplayLabel();
  const catTitle =
    settings.randomCatVideo === true
      ? 'A random gallery cat each time you hit the limit. Turn off Random cat below to pin one video.'
      : 'Same cat walks the screen when you hit the limit on any site. Change it in the Cat tab.';

  el.innerHTML = `
    <div class="site-limits-column-head">
      <span>Site</span>
      <span>Limit</span>
      <span title="${catTitle}">Cat</span>
      <span></span>
    </div>
    ${entries
      .map(
        ([domain, ms]) => `
    <div class="site-item">
      <span class="site-item-domain" title="${domain}">${domain}</span>
      <span class="site-item-limit">${Math.round(ms / 60000)}m</span>
      <span class="site-item-cats" title="${catTitle}">${catLabel}</span>
      <button class="site-item-rm" data-d="${domain}" type="button" title="Remove">✕</button>
    </div>`
      )
      .join('')}`;

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

  const exCatTitle = 'Excluded sites are not timed and never show the break cat.';
  el.innerHTML = `
    <div class="site-limits-column-head">
      <span>Site</span>
      <span>Limit</span>
      <span title="${exCatTitle}">Cat</span>
      <span></span>
    </div>
    ${sites
      .map(
        (domain) => `
    <div class="site-item">
      <span class="site-item-domain" title="${domain}">${domain}</span>
      <span class="site-item-limit" style="color:#2f995f">Excluded</span>
      <span class="site-item-cats" title="${exCatTitle}">—</span>
      <button class="site-item-rm" data-d="${domain}" type="button" title="Remove">✕</button>
    </div>`
      )
      .join('')}`;

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
      const selected = !settings.randomCatVideo && video.file === settings.catVideoFile;
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
      renderSiteLimits();
      renderExcludedSites();
      queueSave();
    });
  });
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  document.querySelectorAll('.section .info').forEach((icon) => {
    icon.setAttribute('tabindex', '0');
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.getElementById('enabled-toggle').addEventListener('change', (e) => {
    settings.enabled = e.target.checked;
    queueSave();
  });

  document.getElementById('tracked-sites-only').addEventListener('change', (e) => {
    settings.trackedSitesOnly = e.target.checked;
    renderSiteLimits();
    queueSave();
    showToast(
      settings.trackedSitesOnly
        ? 'Only sites on your list are timed now'
        : 'Default limit applies to all non-excluded sites again',
      'info'
    );
  });

  document.getElementById('random-cat-toggle').addEventListener('change', (e) => {
    settings.randomCatVideo = e.target.checked;
    renderVideoGrid();
    renderSiteLimits();
    queueSave();
    showToast(settings.randomCatVideo ? 'Random cat on' : 'Random cat off', 'info');
  });

  const onDefaultLimitInput = (e) => {
    const mins = parseInt(e.target.value, 10);
    clearTimeout(defaultLimitToastTimer);
    if (Number.isNaN(mins) || mins < 1) {
      defaultLimitToastTimer = setTimeout(() => {
        showToast('Enter minutes (>=1)', 'error');
        syncDefaultLimitInputs(Math.max(1, Math.round((settings.defaultLimit || 30 * 60 * 1000) / 60000)));
      }, 700);
      return;
    }
    settings.defaultLimit = mins * 60 * 1000;
    syncDefaultLimitInputs(mins);
    renderDefaultLimitChips();
    queueSave();
    defaultLimitToastTimer = setTimeout(() => showToast(`Default limit set to ${mins}m`, 'success'), 700);
  };

  document.getElementById('default-limit').addEventListener('input', onDefaultLimitInput);
  document.getElementById('default-limit-cat').addEventListener('input', onDefaultLimitInput);

  document.getElementById('cat-linger').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    settings.catLingerMinutes = Math.max(0.1, Number.isFinite(value) ? value : 2);
    renderCatLingerChips();
    queueSave();
    clearTimeout(catLingerToastTimer);
    catLingerToastTimer = setTimeout(() => showToast(`Auto-dismiss set to ${settings.catLingerMinutes}m`, 'success'), 700);
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

  const resetAllBtn = document.getElementById('reset-all-btn');
  if (resetAllBtn) resetAllBtn.addEventListener('click', resetAllStats);
  document.getElementById('preview-cat-btn').addEventListener('click', previewCatNow);
  document.getElementById('shoo-cat-btn').addEventListener('click', shooCatAway);
  document.getElementById('shoo-cat-btn-settings').addEventListener('click', shooCatAway);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushPendingSave();
    }
  });

  const tourReplay = document.getElementById('tour-replay');
  if (tourReplay) tourReplay.addEventListener('click', () => openTour(0));
  document.getElementById('tour-skip')?.addEventListener('click', () => closeTour(true));
  document.getElementById('tour-next')?.addEventListener('click', () => {
    if (tourStepIndex >= TOUR_STEPS.length - 1) {
      closeTour(true);
      return;
    }
    tourStepIndex += 1;
    renderTourStep();
    document.getElementById('tour-next')?.focus();
  });

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('tour-overlay');
    if (!overlay || overlay.classList.contains('is-hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTour(true);
    }
  });
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    const on = button.dataset.tab === tabId;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
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
    const videoFile = settings.randomCatVideo ? pickRandomCatFileForPreview() : settings.catVideoFile;
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_CAT',
      domain,
      timeSpent: 31 * 60 * 1000,
      limit: 30 * 60 * 1000,
      lingerMs: Math.max(0.1, Number(settings.catLingerMinutes ?? 2)) * 60 * 1000,
      videoFile,
      force: true
    });
    msg.textContent = settings.randomCatVideo ? 'Preview: one random cat on this tab.' : 'Preview shown on this tab.';
    showToast(settings.randomCatVideo ? 'Preview: random cat' : 'Preview shown on this tab', 'success');
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
  if (domain in siteLimits) return siteLimits[domain];
  const alt = `www.${domain}`;
  if (alt in siteLimits) return siteLimits[alt];
  if (settings.trackedSitesOnly === true) return 0;
  return settings.defaultLimit || 30 * 60 * 1000;
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

async function initTour() {
  try {
    const stored = await chrome.storage.local.get(TOUR_STORAGE_KEY);
    if (!stored[TOUR_STORAGE_KEY]) openTour(0);
  } catch {
    /* storage unavailable; Tour button still works */
  }
}

function openTour(fromStep = 0) {
  tourStepIndex = fromStep;
  const overlay = document.getElementById('tour-overlay');
  const replay = document.getElementById('tour-replay');
  if (!overlay) return;
  overlay.classList.remove('is-hidden');
  overlay.setAttribute('aria-hidden', 'false');
  if (replay) replay.disabled = true;
  renderTourStep();
  queueMicrotask(() => document.getElementById('tour-next')?.focus());
}

function clearTourScrim() {
  const scrim = document.getElementById('tour-scrim');
  if (scrim) scrim.style.clipPath = 'none';
}

function setTourScrimHole(rect) {
  const scrim = document.getElementById('tour-scrim');
  if (!scrim) return;
  if (!rect || rect.width < 4 || rect.height < 4) {
    scrim.style.clipPath = 'none';
    return;
  }
  const pad = 10;
  const W = window.innerWidth;
  const H = window.innerHeight;
  let x1 = rect.left - pad;
  let y1 = rect.top - pad;
  let x2 = rect.right + pad;
  let y2 = rect.bottom + pad;
  x1 = Math.max(0, Math.min(x1, W));
  y1 = Math.max(0, Math.min(y1, H));
  x2 = Math.max(0, Math.min(x2, W));
  y2 = Math.max(0, Math.min(y2, H));
  if (x2 - x1 < 24 || y2 - y1 < 24) {
    scrim.style.clipPath = 'none';
    return;
  }
  const d = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
  scrim.style.clipPath = `path(evenodd, '${d}')`;
}

async function closeTour(markDone) {
  const overlay = document.getElementById('tour-overlay');
  const replay = document.getElementById('tour-replay');
  if (!overlay) return;
  clearTourPin();
  clearTourScrim();
  overlay.classList.remove('tour-has-target', 'tour-target-lower', 'tour-target-upper');
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
  if (replay) replay.disabled = false;
  if (markDone) {
    try {
      await chrome.storage.local.set({ [TOUR_STORAGE_KEY]: true });
    } catch {
      /* ignore */
    }
  }
}

function clearTourPin() {
  document.querySelectorAll('.is-tour-pin').forEach((el) => el.classList.remove('is-tour-pin'));
}

function renderTourStep() {
  const step = TOUR_STEPS[tourStepIndex];
  if (!step) return;
  const overlay = document.getElementById('tour-overlay');
  if (overlay) {
    overlay.classList.toggle('tour-has-target', Boolean(step.targetSelector));
    overlay.classList.remove('tour-target-lower', 'tour-target-upper');
  }
  clearTourPin();
  clearTourScrim();
  setActiveTab(step.tab);
  const titleEl = document.getElementById('tour-title');
  const bodyEl = document.getElementById('tour-body');
  const nextBtn = document.getElementById('tour-next');
  const dotsEl = document.getElementById('tour-dots');
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;
  if (nextBtn) nextBtn.textContent = tourStepIndex >= TOUR_STEPS.length - 1 ? 'Done' : 'Next';
  if (dotsEl) {
    dotsEl.innerHTML = '';
    TOUR_STEPS.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = `tour-dot${i === tourStepIndex ? ' is-active' : ''}`;
      dotsEl.appendChild(dot);
    });
  }

  const sel = step.targetSelector;
  if (typeof sel === 'string' && sel.length > 0) {
    const pinEl = document.querySelector(sel);
    if (pinEl) {
      pinEl.classList.add('is-tour-pin');
      pinEl.scrollIntoView({
        block: step.tourScrollBlock || 'nearest',
        behavior: 'auto'
      });
      const applyHole = () => {
        const r = pinEl.getBoundingClientRect();
        setTourScrimHole(r);
        if (overlay) {
          let lower;
          const place = step.tourModalPlacement;
          if (place === 'top') lower = true;
          else if (place === 'bottom') lower = false;
          else {
            const cy = r.top + r.height / 2;
            lower = cy > window.innerHeight * 0.38;
          }
          overlay.classList.toggle('tour-target-lower', lower);
          overlay.classList.toggle('tour-target-upper', !lower);
        }
      };
      requestAnimationFrame(() => {
        applyHole();
        requestAnimationFrame(applyHole);
      });
    }
  }
}

load();
