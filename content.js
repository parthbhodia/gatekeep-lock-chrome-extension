(() => {
if (window.__fcbContentScriptLoaded) return;
window.__fcbContentScriptLoaded = true;

// content.js — injected into every page
// Shows the real cat overlay when the background says it's time.

let catOverlay = null;
let currentDomain = null;
let catShownAt = 0;
let hideTimer = null;
let countdownTimer = null;
let drawFrameId = null;
let dialogHideTimer = null;
let pausedVideos = [];
let keydownHandler = null;
const catVideoUrls = new Map();
const DEFAULT_LINGER_MS = 2 * 60 * 1000;
const DIALOG_HIDE_MS = 5 * 1000;
const DEFAULT_CAT_VIDEO_FILE = 'snaptik_7313952845961645314_v3.mp4';
const ALLOWED_CAT_VIDEO_FILES = new Set([
  'YTDown_YouTube_Sad-Cat-Meowing-Meme-Green-Screen-sadcat_Media_2ND0G6nIUKY_001_1080p.mp4',
  'snaptik_7330929514878356741_v3.mp4',
  'snaptik_7313952845961645314_v3.mp4',
  'snaptik_7632449998856178965_v3.mp4'
]);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FCB_PING') {
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'GET_CAT_STATE') {
    sendResponse({ active: Boolean(catOverlay) });
    return;
  }

  if (msg.type === 'SHOO_CAT') {
    if (catOverlay) {
      dismissWithOptions({ resetSite: true, resumePaused: false });
      sendResponse({ ok: true, dismissed: true });
      return;
    }
    sendResponse({ ok: true, dismissed: false });
    return;
  }

  if (msg.type === 'SHOW_CAT') {
    if (catOverlay) return;
    showCat(msg.domain, msg.timeSpent, msg.limit, msg.lingerMs, msg.videoFile);
  }
});

async function showCat(domain, timeSpent, limit, lingerMs = DEFAULT_LINGER_MS, videoFile = DEFAULT_CAT_VIDEO_FILE) {
  currentDomain = domain;
  catShownAt = Date.now();
  pauseVisibleVideos();
  const safeLingerMs = Math.max(6 * 1000, Number(lingerMs) || DEFAULT_LINGER_MS);
  const safeVideoFile = getSafeCatVideoFile(videoFile);
  const timeStr = formatTime(timeSpent);
  const limitStr = formatTime(limit);

  catOverlay = document.createElement('div');
  catOverlay.id = 'fcb-overlay';
  catOverlay.innerHTML = `
    <div class="fcb-backdrop"></div>
    <div class="fcb-timer" id="fcb-timer">${formatCountdown(safeLingerMs)}</div>
    <div class="fcb-cat-stage" aria-live="polite">
      <div class="fcb-cat-wrap">
        <canvas class="fcb-cat-canvas" id="fcb-cat-canvas"></canvas>
        <video class="fcb-source-video" id="fcb-source-video" muted loop playsinline preload="metadata"></video>
        <div class="fcb-floor-shadow"></div>
      </div>
    </div>
    <div class="fcb-card" id="fcb-card">
      <button class="fcb-card-close" id="fcb-card-close" aria-label="Close dialog">×</button>
      <p class="fcb-title">The cat has claimed your screen</p>
      <p class="fcb-body">You've been on <strong>${escapeHTML(domain)}</strong><br>for <strong>${timeStr}</strong> (limit: ${limitStr})</p>
    </div>
  `;

  document.body.appendChild(catOverlay);

  const video = document.getElementById('fcb-source-video');
  const canvas = document.getElementById('fcb-cat-canvas');
  const timer = document.getElementById('fcb-timer');
  const card = document.getElementById('fcb-card');
  const cardClose = document.getElementById('fcb-card-close');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const buffer = document.createElement('canvas');
  const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });

  requestAnimationFrame(() => requestAnimationFrame(() => catOverlay?.classList.add('fcb-in')));
  cardClose?.addEventListener('click', hideDialog);
  dialogHideTimer = setTimeout(hideDialog, DIALOG_HIDE_MS);
  keydownHandler = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dismissWithOptions({ resetSite: true, resumePaused: false });
  };
  window.addEventListener('keydown', keydownHandler, true);

  try {
    video.src = getCatVideoUrl(safeVideoFile);
    await video.play();
    setupCanvas(video, canvas, buffer);
    drawCatFrame(video, canvas, ctx, buffer, bufferCtx);
  } catch {
    catOverlay.classList.add('fcb-video-fallback');
  }

  const endsAt = Date.now() + safeLingerMs;
  countdownTimer = setInterval(() => {
    timer.textContent = formatCountdown(endsAt - Date.now());
  }, 250);

  hideTimer = setTimeout(() => {
    dismissWithOptions({ resetSite: true, resumePaused: true });
  }, safeLingerMs);
}

function pauseVisibleVideos() {
  pausedVideos = [];
  const videos = document.querySelectorAll('video');
  videos.forEach((video) => {
    if (video.paused || video.ended) return;
    if (!isElementVisible(video)) return;
    try {
      video.pause();
      pausedVideos.push(video);
    } catch {
      // Ignore pause failures per element.
    }
  });
}

function resumePausedVideos() {
  pausedVideos.forEach((video) => {
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Ignore resume failures per element.
    }
  });
  pausedVideos = [];
}

function isElementVisible(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 2 &&
    rect.height > 2 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function getSafeCatVideoFile(videoFile) {
  return ALLOWED_CAT_VIDEO_FILES.has(videoFile) ? videoFile : DEFAULT_CAT_VIDEO_FILE;
}

function getCatVideoUrl(videoFile) {
  if (!catVideoUrls.has(videoFile)) {
    catVideoUrls.set(videoFile, chrome.runtime.getURL(videoFile));
  }
  return catVideoUrls.get(videoFile);
}

function setupCanvas(video, canvas, buffer) {
  const { width, height } = getScaledVideoSize(video);
  canvas.width = width;
  canvas.height = height;
  buffer.width = width;
  buffer.height = height;
}

function drawCatFrame(video, canvas, ctx, buffer, bufferCtx) {
  if (!catOverlay) return;

  if (video.readyState >= 2) {
    try {
      const targetSize = getScaledVideoSize(video);
      if (buffer.width !== targetSize.width || buffer.height !== targetSize.height) {
        setupCanvas(video, canvas, buffer);
      }

      bufferCtx.drawImage(video, 0, 0, buffer.width, buffer.height);
      const frame = bufferCtx.getImageData(0, 0, buffer.width, buffer.height);
      const pixels = frame.data;
      const width = frame.width;
      const height = frame.height;
      const alphaMask = new Uint8ClampedArray(width * height);

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const keyStrength = getGreenKeyStrength(r, g, b);
        const alphaIndex = i / 4;

        if (keyStrength > 0.86) {
          pixels[i + 3] = 0;
        } else if (keyStrength > 0.07) {
          const fade = smoothstep(0.07, 0.86, keyStrength);
          pixels[i + 3] = Math.round(255 * (1 - fade));
        }

        if (keyStrength > 0.01 || g > r * 0.82 || g > b + 6) {
          const neutralGreen = Math.round((r * 0.62) + (b * 0.28) + 10);
          pixels[i + 1] = Math.min(g, neutralGreen);
        }

        alphaMask[alphaIndex] = pixels[i + 3];
      }

      fillAlphaHoles(pixels, alphaMask, width, height);
      featherAlpha(pixels, alphaMask, width, height);

      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 12) pixels[i] = 0;
      }

      const bounds = getAlphaBounds(pixels, width, height, 28);
      if (bounds) {
        const cropWidth = bounds.maxX - bounds.minX + 1;
        const cropHeight = bounds.maxY - bounds.minY + 1;

        canvas.width = cropWidth;
        canvas.height = cropHeight;
        ctx.putImageData(frame, -bounds.minX, -bounds.minY);
      } else {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
      }
    } catch {
      catOverlay?.classList.add('fcb-video-fallback');
      return;
    }
  }

  drawFrameId = requestAnimationFrame(() => drawCatFrame(video, canvas, ctx, buffer, bufferCtx));
}

function getScaledVideoSize(video) {
  const sourceWidth = video.videoWidth || 1920;
  const sourceHeight = video.videoHeight || 1080;
  const width = Math.min(1280, sourceWidth);
  const height = Math.round((sourceHeight / sourceWidth) * width);
  return { width, height };
}

function getAlphaBounds(pixels, width, height, padding) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[((y * width + x) * 4) + 3];
      if (alpha <= 28) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: Math.min(width - 1, maxX + padding),
    maxY: Math.min(height - 1, maxY + padding)
  };
}

function dismiss() {
  dismissWithOptions({ resetSite: false, resumePaused: false });
}

function dismissWithOptions(options = {}) {
  const { resetSite = false, resumePaused = false } = options;
  if (!catOverlay) return;
  clearTimeout(hideTimer);
  clearTimeout(dialogHideTimer);
  clearInterval(countdownTimer);
  cancelAnimationFrame(drawFrameId);
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  if (resetSite) {
    chrome.runtime.sendMessage({ type: 'RESET_SITE', domain: currentDomain });
  }
  if (resumePaused) {
    resumePausedVideos();
  } else {
    pausedVideos = [];
  }

  const video = document.getElementById('fcb-source-video');
  video?.pause();
  catOverlay.classList.remove('fcb-in');
  catOverlay.classList.add('fcb-out');

  setTimeout(() => {
    catOverlay?.remove();
    catOverlay = null;
  }, 450);
}

function hideDialog() {
  const card = document.getElementById('fcb-card');
  if (!card || card.classList.contains('fcb-card-hidden')) return;
  card.classList.add('fcb-card-hidden');
  setTimeout(() => card.remove(), 260);
}

function smoothstep(edge0, edge1, value) {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function getGreenKeyStrength(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const maxRedBlue = Math.max(r, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const greenExcess = g - maxRedBlue;
  const greenLeaning = g > r * 1.04 && g > b * 1.08;

  if (!greenLeaning || saturation < 0.085) return 0;

  const dominanceStrength = smoothstep(6, 54, greenExcess);
  const saturationStrength = smoothstep(0.085, 0.42, saturation);
  const brightnessStrength = smoothstep(18, 74, max);
  const shadowStrength = greenExcess > 4 ? smoothstep(0.11, 0.32, saturation) * brightnessStrength * 0.62 : 0;

  return Math.min(1, Math.max(dominanceStrength * saturationStrength, shadowStrength));
}

function fillAlphaHoles(pixels, alphaMask, width, height) {
  const repaired = new Uint8ClampedArray(alphaMask);

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const maskIndex = y * width + x;
      if (alphaMask[maskIndex] > 32) continue;

      let opaqueNeighbors = 0;
      let alphaTotal = 0;
      let redTotal = 0;
      let greenTotal = 0;
      let blueTotal = 0;

      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const neighborIndex = (y + oy) * width + x + ox;
          const neighborAlpha = alphaMask[neighborIndex];
          if (neighborAlpha <= 132) continue;

          const pixelIndex = neighborIndex * 4;
          opaqueNeighbors += 1;
          alphaTotal += neighborAlpha;
          redTotal += pixels[pixelIndex];
          greenTotal += pixels[pixelIndex + 1];
          blueTotal += pixels[pixelIndex + 2];
        }
      }

      if (opaqueNeighbors < 16) continue;

      const pixelIndex = maskIndex * 4;
      repaired[maskIndex] = Math.round(alphaTotal / opaqueNeighbors);
      pixels[pixelIndex] = Math.round(redTotal / opaqueNeighbors);
      pixels[pixelIndex + 1] = Math.round(greenTotal / opaqueNeighbors);
      pixels[pixelIndex + 2] = Math.round(blueTotal / opaqueNeighbors);
    }
  }

  alphaMask.set(repaired);
  for (let i = 0; i < alphaMask.length; i += 1) {
    pixels[(i * 4) + 3] = alphaMask[i];
  }
}

function featherAlpha(pixels, alphaMask, width, height) {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const maskIndex = y * width + x;
      const alpha = alphaMask[maskIndex];
      if (alpha === 0) continue;

      let total = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          total += alphaMask[(y + oy) * width + x + ox];
        }
      }

      const average = total / 9;
      const softened = average < alpha ? Math.round(alpha * 0.42 + average * 0.58) : alpha;
      pixels[(maskIndex * 4) + 3] = Math.min(alpha, softened);
    }
  }
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

})();
