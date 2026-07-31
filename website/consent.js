/* Cat Break — cookie consent.
   Google Analytics is NOT loaded until consent is explicitly granted. Nothing is
   set on first paint, so a visitor who ignores or declines the banner is never
   measured. Declining is one click, same as accepting. */

(function () {
  'use strict';

  var GA_ID = 'G-SFGHY3T64Y';
  var KEY = 'catbreak-consent'; // "granted" | "denied"

  function read() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null; // Storage blocked — treat as undecided and never load GA.
    }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* Private mode or storage disabled — the choice just won't persist. */
    }
  }

  /* Global Privacy Control / Do Not Track are treated as a standing refusal, so
     those visitors are never asked and never measured. */
  function signalsRefusal() {
    return (
      navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1' ||
      navigator.msDoNotTrack === '1'
    );
  }

  var gaLoaded = false;

  function loadAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  /* ── Banner ────────────────────────────────────────────────────────────── */

  var banner = null;

  function close() {
    if (!banner) return;
    banner.classList.remove('is-in');
    var el = banner;
    banner = null;
    setTimeout(function () { el.remove(); }, 300);
  }

  function decide(value) {
    write(value);
    if (value === 'granted') loadAnalytics();
    close();
  }

  function build() {
    if (banner) return;

    banner = document.createElement('div');
    banner.className = 'cookie';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p class="cookie-title">🐾 A quick one about cookies</p>' +
      '<p class="cookie-body">We’d like to use Google Analytics to count visits to this site. ' +
      'It sets cookies. The <strong>extension</strong> never does any of this — it still reports nothing, ever. ' +
      '<a href="privacy.html">Read the policy</a>.</p>' +
      '<div class="cookie-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-consent="granted">Allow analytics</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-consent="denied">No thanks</button>' +
      '</div>';

    document.body.appendChild(banner);

    banner.querySelectorAll('[data-consent]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        decide(btn.getAttribute('data-consent'));
      });
    });

    // rAF for the transition, timeout as a backstop if frames aren't served.
    var show = function () { if (banner) banner.classList.add('is-in'); };
    requestAnimationFrame(function () { requestAnimationFrame(show); });
    setTimeout(show, 100);
  }

  /* Let people change their mind later — withdrawal has to be as easy as consent. */
  window.catbreakCookieSettings = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    gaLoaded = false;
    build();
  };

  function init() {
    document.querySelectorAll('[data-cookie-settings]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        window.catbreakCookieSettings();
      });
    });

    var choice = read();
    if (choice === 'granted') { loadAnalytics(); return; }
    if (choice === 'denied') return;
    if (signalsRefusal()) return; // Respect GPC/DNT without nagging.
    build();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
