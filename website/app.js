/* Cat Break — catbreak.com
   The cat clips are green-screen sources; the extension chroma-keys them onto a
   canvas at runtime. This is a port of that same pipeline (content.js) so the
   cats on the site are cut out exactly the way they are in the product. */

const SUPABASE_BASE =
  'https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/public/cat-videos/';

/* Verified present in the bucket. Keep in sync when clips are added or removed. */
const CATS = [
  'cat-morning-paws.mp4',
  'cat-street-strut.mp4',
  'cat-window-watcher.mp4',
  'cat-garden-stroll.mp4',
  'cat-twilight-prowl.mp4',
  'cat-lazy-stretch.mp4',
  'cat-curious-stroll.mp4',
  'cat-elegant-steps.mp4',
  'cat-alley-amble.mp4'
];

const MEOWS = [
  'Meow — your scroll paw needs a rest.',
  'Gentle head-bonk: that is enough pixels for now.',
  'This cat says stretch, hydrate, and blink away from the tab.',
  'Purr-haps it is time to stand up and meander?',
  'The internet will still be here in a few minutes.',
  'Mrrp. Something besides this screen misses you.',
  'Even curiosity needed a nap. You are next.',
  'Soft meow, loud hint: break time.',
  'Boop. Your human eyes deserve a different focal length.',
  'The tab can wait; your spine cannot. Meow.'
];

const DRAW_INTERVAL_MS = 50; // ~20fps, same budget the extension uses
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const label = (file) =>
  file
    .replace(/\.mp4$/, '')
    .replace(/^cat-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ── Chroma key (ported from content.js) ──────────────────────────────────── */

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
  const shadowStrength =
    greenExcess > 4 ? smoothstep(0.11, 0.32, saturation) * brightnessStrength * 0.62 : 0;

  return Math.min(1, Math.max(dominanceStrength * saturationStrength, shadowStrength));
}

function getAlphaBounds(pixels, width, height, padding) {
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: Math.min(width - 1, maxX + padding),
    maxY: Math.min(height - 1, maxY + padding)
  };
}

/**
 * Binds a green-screen clip to a canvas and keys it in a rAF loop.
 * Only draws while `slot.playing` is true so off-screen cats cost nothing.
 */
function createCat(slot, file, maxWidth) {
  const canvas = slot.querySelector('.cat-canvas');
  if (!canvas) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const buffer = document.createElement('canvas');
  const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });

  // The source stays in the DOM but visually hidden: a detached <video> is not a
  // reliable autoplay target, and we only ever paint it through the canvas.
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; // required, or getImageData taints the canvas
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.className = 'cat-src';
  video.setAttribute('muted', '');
  video.setAttribute('aria-hidden', 'true');
  slot.appendChild(video);

  let raf = null;
  let lastDraw = 0;
  let sized = false;
  let tainted = false;

  function size() {
    const sw = video.videoWidth || 1920;
    const sh = video.videoHeight || 1080;
    const w = Math.min(maxWidth, sw);
    const h = Math.round((sh / sw) * w);
    buffer.width = w;
    buffer.height = h;
    canvas.width = w;
    canvas.height = h;
    sized = true;
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (video.readyState < 2 || now - lastDraw < DRAW_INTERVAL_MS) return;
    lastDraw = now;

    if (!sized) size();

    try {
      bufferCtx.drawImage(video, 0, 0, buffer.width, buffer.height);
      const frame = bufferCtx.getImageData(0, 0, buffer.width, buffer.height);
      const px = frame.data;

      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const k = getGreenKeyStrength(r, g, b);

        if (k > 0.86) {
          px[i + 3] = 0;
        } else if (k > 0.07) {
          px[i + 3] = Math.round(255 * (1 - smoothstep(0.07, 0.86, k)));
        }

        // suppress green spill on the kept edges
        if (k > 0.01 || g > r * 0.82 || g > b + 6) {
          px[i + 1] = Math.min(g, Math.round(r * 0.62 + b * 0.28 + 10));
        }
      }
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] < 12) px[i] = 0;
      }

      const bounds = getAlphaBounds(px, frame.width, frame.height, 20);
      if (bounds) {
        canvas.width = bounds.maxX - bounds.minX + 1;
        canvas.height = bounds.maxY - bounds.minY + 1;
        ctx.putImageData(frame, -bounds.minX, -bounds.minY);
      } else {
        canvas.width = frame.width;
        canvas.height = frame.height;
        ctx.putImageData(frame, 0, 0);
      }
      slot.classList.remove('is-loading');
    } catch {
      // Cross-origin read blocked — stop keying and fall back to the raw clip.
      tainted = true;
      stop();
      fallbackToVideo();
    }
  }

  // Last resort: if the frame can't be read, show the clip as-is rather than nothing.
  function fallbackToVideo() {
    canvas.remove();
    video.className = 'cat-canvas';
    video.removeAttribute('aria-hidden');
    slot.classList.remove('is-loading');
    video.play().catch(() => {});
  }

  function start() {
    if (tainted || raf !== null) return;
    if (!video.src) video.src = SUPABASE_BASE + file;
    video.play().catch(() => {});
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    video.pause();
  }

  video.addEventListener('loadedmetadata', size, { once: true });
  slot.classList.add('is-loading');

  return { start, stop, el: slot };
}

/* ── Wire the cats on the page ───────────────────────────────────────────── */

const instances = [];

function register(slot, file, maxWidth) {
  const cat = createCat(slot, file, maxWidth);
  if (cat) instances.push(cat);
  return cat;
}

// Hero
const heroSlot = document.querySelector('.cat-slot[data-hero]');
if (heroSlot) register(heroSlot, heroSlot.dataset.cat, 480);

// Gallery — the cards ship in the HTML so their names are crawlable; hydrate them
// here. Any card without a data-cat falls back to the CATS list by position.
document.querySelectorAll('.cat-card').forEach((card, i) => {
  const file = card.dataset.cat || CATS[i];
  if (!file) return;
  if (!card.querySelector('.cat-name')) {
    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = label(file);
    card.appendChild(name);
  }
  register(card, file, 300);
});

// Final CTA
const finalSlot = document.querySelector('.final-cat');
if (finalSlot) register(finalSlot, finalSlot.dataset.cat, 340);

// Play only what is on screen, and only while the tab is actually visible
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const cat = instances.find((c) => c.el === entry.target);
      if (!cat) return;
      cat.inView = entry.isIntersecting;
      if (cat.inView && !document.hidden) cat.start();
      else cat.stop();
    });
  },
  { rootMargin: '200px' }
);
instances.forEach((c) => io.observe(c.el));

// requestAnimationFrame is frozen in a hidden tab — resume the visible cats on return
document.addEventListener('visibilitychange', () => {
  instances.forEach((c) => {
    if (document.hidden) c.stop();
    else if (c.inView) c.start();
  });
});

/* ── Live demo overlay ───────────────────────────────────────────────────── */

const demo = document.getElementById('demo');
const demoTimer = document.getElementById('demoTimer');
const demoClose = document.getElementById('demoClose');
const demoTitle = document.getElementById('demoTitle');
const demoSlot = demo?.querySelector('.demo-cat');

let demoCat = null;
let demoInterval = null;
let demoTimeout = null;
const DEMO_MS = 20000;

function openDemo() {
  if (!demo || !demoSlot) return;

  demoTitle.textContent = pick(MEOWS);

  // Fresh cat each time — rebuild the canvas so a previous instance is discarded.
  demoCat?.stop();
  demoSlot.innerHTML = '<canvas class="cat-canvas"></canvas><div class="cat-shadow"></div>';
  demoCat = createCat(demoSlot, pick(CATS), 520);

  demo.hidden = false;
  document.body.classList.add('demo-open');
  // rAF for a clean fade-in, timeout as a backstop so the overlay can never
  // get stuck invisible if frames aren't being served.
  const fadeIn = () => demo.classList.add('is-in');
  requestAnimationFrame(() => requestAnimationFrame(fadeIn));
  setTimeout(fadeIn, 100);
  demoCat?.start();

  const endsAt = Date.now() + DEMO_MS;
  const tick = () => {
    const left = Math.max(0, endsAt - Date.now());
    const s = Math.ceil(left / 1000);
    demoTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  demoInterval = setInterval(tick, 250);
  demoTimeout = setTimeout(closeDemo, DEMO_MS);

  demoClose.focus();
}

function closeDemo() {
  if (!demo) return;
  clearInterval(demoInterval);
  clearTimeout(demoTimeout);
  demo.classList.remove('is-in');
  document.body.classList.remove('demo-open');
  demoCat?.stop();
  setTimeout(() => {
    demo.hidden = true;
    demoSlot.innerHTML = '<canvas class="cat-canvas"></canvas><div class="cat-shadow"></div>';
  }, 400);
}

document.querySelectorAll('[data-demo-trigger]').forEach((btn) => {
  btn.addEventListener('click', openDemo);
});
demoClose?.addEventListener('click', closeDemo);
demo?.querySelector('.demo-scrim')?.addEventListener('click', closeDemo);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && demo && !demo.hidden) {
    e.preventDefault();
    closeDemo();
  }
});

/* ── Chrome ──────────────────────────────────────────────────────────────── */

const nav = document.getElementById('nav');
const onScroll = () => nav?.classList.toggle('is-stuck', window.scrollY > 12);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

document.getElementById('year').textContent = String(new Date().getFullYear());

if (!reduceMotion && 'IntersectionObserver' in window) {
  const targets = [
    ...document.querySelectorAll(
      '.problem-cards, .steps, .fbanner, .cat-grid, .tryit-inner, .faq-list, .final-inner, .problem .section-title, .problem .section-lede'
    )
  ];
  targets.forEach((el) => el.classList.add('on-scroll'));

  const reveal = (el) => el.classList.add('is-visible');

  const revealIO = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px' }
  );
  targets.forEach((el) => revealIO.observe(el));

  // Safety net: content must never stay invisible because the observer didn't fire.
  setTimeout(() => {
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    });
  }, 2000);
}

/* ── Roaming cat ─────────────────────────────────────────────────────────── */

/* Every so often a cat strolls across the bottom of the page, and you can shoo
   her off the way you would a real break.

   One deliberate difference from the extension: there, shooing takes a
   ten-second hold, because making dismissal effortful is the entire product.
   Here she is decoration on a marketing page, so a single click is enough —
   the same friction that helps in the product would only irritate a visitor. */

const ROAM_FIRST_MS = 22 * 1000;  // let people read something before a cat turns up
const ROAM_GAP_MS = 95 * 1000;    // quiet stretch between strolls
const ROAM_WALK_MS = 26 * 1000;   // one crossing, edge to edge
const ROAM_RETRY_MS = 6 * 1000;   // re-check while something is in her way
const ROAM_KEY = 'catbreak-roamer-off';
const ROAM_SAYS = ['Mrrp!', 'Meow!', 'Fine, fine.', 'Rude.', 'Hmph.', 'Later, then.'];

function roamerDismissed() {
  try {
    return sessionStorage.getItem(ROAM_KEY) === '1';
  } catch {
    return false; // Storage blocked — she just won't be remembered.
  }
}

function setupRoamer() {
  const roamer = document.getElementById('roamer');
  const slot = roamer?.querySelector('.roamer-cat');
  const shooBtn = document.getElementById('roamerShoo');
  const say = document.getElementById('roamerSay');
  if (!roamer || !slot || !shooBtn) return;

  /* createCat rather than register(): the shared instances list is driven by an
     IntersectionObserver, and a fixed-position cat that is always technically
     on screen would fight it. This one starts and stops on its own schedule. */
  const cat = createCat(slot, slot.dataset.cat, 190);
  if (!cat) return;

  let walk = null;
  let nextTimer = null;
  let rightward = true;
  let gone = false;

  const width = () => roamer.offsetWidth || 150;
  const xNow = () => new DOMMatrix(getComputedStyle(roamer).transform).m41;

  /* The consent banner is fixed bottom-left at a far higher z-index, and the
     demo is a full-screen modal. Walking behind either means she is invisible
     and unclickable for that stretch — and a cat wandering over a consent
     prompt is the wrong thing to obscure regardless. Wait them out. */
  function blocked() {
    return !!document.querySelector('.cookie') ||
      document.body.classList.contains('demo-open');
  }

  function stroll() {
    if (gone) return;
    if (document.hidden || blocked()) return schedule(ROAM_RETRY_MS);

    const from = rightward ? -width() : window.innerWidth;
    const to = rightward ? window.innerWidth : -width();

    // The clip walks one way; mirror it so she always faces where she is going.
    slot.style.transform = rightward ? 'scaleX(1)' : 'scaleX(-1)';
    roamer.hidden = false;
    cat.start();

    walk = roamer.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: ROAM_WALK_MS, easing: 'linear', fill: 'forwards' }
    );
    walk.onfinish = rest;
  }

  function rest() {
    walk = null;
    roamer.hidden = true;
    cat.stop();
    rightward = !rightward;
    schedule(ROAM_GAP_MS);
  }

  function schedule(delay) {
    clearTimeout(nextTimer);
    if (gone) return;
    nextTimer = setTimeout(stroll, delay);
  }

  /* Shooed: she bolts for the edge she was heading towards, with a parting
     word, and takes the hint for the rest of the visit. */
  function shoo() {
    if (gone || roamer.hidden || !walk) return;
    gone = true;
    clearTimeout(nextTimer);
    roamer.classList.add('is-shooed');

    const x = xNow();
    walk.cancel();
    walk = null;
    roamer.style.transform = `translateX(${x}px)`;

    if (say) {
      say.textContent = ROAM_SAYS[Math.floor(Math.random() * ROAM_SAYS.length)];
      say.classList.add('is-in');
    }

    const exit = rightward ? window.innerWidth + width() : -width() * 2;
    const bolt = roamer.animate(
      [
        { transform: `translateX(${x}px) translateY(0) scale(1)`, opacity: 1 },
        { transform: `translateX(${(x + exit) / 2}px) translateY(-16px) scale(0.97)`,
          opacity: 1, offset: 0.45 },
        { transform: `translateX(${exit}px) translateY(0) scale(0.9)`, opacity: 0 }
      ],
      { duration: 640, easing: 'cubic-bezier(.32,0,.2,1)', fill: 'forwards' }
    );

    bolt.onfinish = () => {
      roamer.hidden = true;
      cat.stop();
      say?.classList.remove('is-in');
      try {
        sessionStorage.setItem(ROAM_KEY, '1');
      } catch {
        /* Not remembered across pages; she is still gone for this one. */
      }
    };
  }

  shooBtn.addEventListener('click', shoo);

  /* rAF is frozen in a hidden tab, so a stroll would otherwise resume from
     wherever it froze and jump. Pause the paint; the animation keeps its own time. */
  document.addEventListener('visibilitychange', () => {
    if (gone) return;
    if (document.hidden) cat.stop();
    else if (!roamer.hidden) cat.start();
  });

  schedule(ROAM_FIRST_MS);
}

/* Skipped entirely for reduced motion: a cat walking across the page is the one
   thing on this site that is pure movement. */
if (!reduceMotion && !roamerDismissed()) setupRoamer();
