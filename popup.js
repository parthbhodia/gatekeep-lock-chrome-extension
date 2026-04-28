// popup.js

let settings = {
  defaultLimit: 30 * 60 * 1000,
  siteLimits: {},
  enabled: true,
  catLingerMinutes: 2,
  catVideoFile: 'YTDown_YouTube_Sad-Cat-Meowing-Meme-Green-Screen-sadcat_Media_2ND0G6nIUKY_001_1080p.mp4'
};
let siteTime = {};

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (data?.settings) settings = { ...settings, ...data.settings };
    if (data?.siteTime)  siteTime  = data.siteTime;
  } catch {
    // Service worker may not be ready yet on first open
  }
  render();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  // Toggle
  document.getElementById('enabled-toggle').checked = settings.enabled !== false;

  // Default limit
  const mins = Math.max(1, Math.round((settings.defaultLimit || 30 * 60 * 1000) / 60000));
  document.getElementById('default-limit').value = mins;
  document.getElementById('default-slider').value = Math.min(240, mins);

  const lingerMinutes = Math.max(0.1, Number(settings.catLingerMinutes ?? 2));
  document.getElementById('cat-linger').value = lingerMinutes;
  document.getElementById('cat-video').value = settings.catVideoFile || 'YTDown_YouTube_Sad-Cat-Meowing-Meme-Green-Screen-sadcat_Media_2ND0G6nIUKY_001_1080p.mp4';

  renderStats();
  renderSiteLimits();
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
    const limit  = getDomainLimitMs(domain);
    const over   = limit > 0 && ms >= limit;
    const pct    = Math.min(100, (ms / Math.max(maxMs, 1)) * 100);
    return `
      <div class="stat-item">
        <div class="stat-row">
          <span class="stat-domain" title="${domain}">${domain}</span>
          <span class="stat-time ${over ? 'over' : ''}">${fmtMs(ms)}${over ? ' ⚠' : ''}</span>
        </div>
        <div class="stat-bar">
          <div class="stat-fill ${over ? 'over' : ''}" style="width:${pct}%"></div>
        </div>
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
      <button class="site-item-rm" data-d="${domain}" title="Remove">✕</button>
    </div>`).join('');

  el.querySelectorAll('.site-item-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      delete settings.siteLimits[btn.dataset.d];
      renderSiteLimits();
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomainLimitMs(domain) {
  const sl = settings.siteLimits || {};
  return domain in sl ? sl[domain] : (settings.defaultLimit || 30 * 60 * 1000);
}

function fmtMs(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function cleanDomain(raw) {
  return raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

// ─── Events ───────────────────────────────────────────────────────────────────

// Sync number ↔ slider
document.getElementById('default-limit').addEventListener('input', (e) => {
  const v = Math.max(1, parseInt(e.target.value) || 1);
  document.getElementById('default-slider').value = Math.min(240, v);
  settings.defaultLimit = v * 60 * 1000;
});

document.getElementById('default-slider').addEventListener('input', (e) => {
  const v = parseInt(e.target.value);
  document.getElementById('default-limit').value = v;
  settings.defaultLimit = v * 60 * 1000;
});

document.getElementById('enabled-toggle').addEventListener('change', (e) => {
  settings.enabled = e.target.checked;
});

document.getElementById('cat-linger').addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  settings.catLingerMinutes = Math.max(0.1, Number.isFinite(value) ? value : 2);
});

document.getElementById('cat-video').addEventListener('change', (e) => {
  settings.catVideoFile = e.target.value;
});

document.getElementById('add-btn').addEventListener('click', () => {
  const domain = cleanDomain(document.getElementById('add-domain').value);
  const mins   = parseInt(document.getElementById('add-limit').value);
  if (!domain || isNaN(mins) || mins < 1) return;

  if (!settings.siteLimits) settings.siteLimits = {};
  settings.siteLimits[domain] = mins * 60 * 1000;

  document.getElementById('add-domain').value = '';
  document.getElementById('add-limit').value  = '';
  renderSiteLimits();
});

document.getElementById('preview-cat-btn').addEventListener('click', async () => {
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
  } catch {
    msg.textContent = 'Reload this page, then try again.';
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  const msg = document.getElementById('save-msg');
  msg.textContent = '✓ Saved!';
  setTimeout(() => (msg.textContent = ''), 2000);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

load();
