/* Cat Break — traffic and install-click measurement for catbreak.com.

   Two sinks, deliberately different in reach:

   - Vercel Web Analytics is cookieless and consent-free, so it sees every
     visitor. It is the honest denominator — the number that answers "how much
     traffic does this site actually get?".
   - Google Analytics exists only after the visitor allows it, at which point
     consent.js defines window.gtag. Testing for that function IS the consent
     check; there is no second flag that could drift out of sync with it.

   Neither sink ever hears from the extension. This is the marketing site only,
   exactly as privacy.html describes. */

(function () {
  'use strict';

  /* consent.js defines window.gtag only once analytics have been granted, and
     it can happen long after load — someone accepting the banner mid-visit
     starts being measured from that click on. */
  function toGA(name, data) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, data);
  }

  /* The va() queue stub is installed in the page head, so events raised before
     the insights script finishes loading are buffered rather than dropped. */
  function toVercel(name, data) {
    if (typeof window.va !== 'function') return;
    window.va('event', { name: name, data: data });
  }

  function track(name, data) {
    toGA(name, data);
    toVercel(name, data);
  }

  window.catbreakTrack = track;

  /* Install CTAs all carry target="_blank", so the click opens the Chrome Web
     Store in a new tab and leaves this document alive to finish sending. That
     is why this needs no sendBeacon fallback and never delays the navigation. */
  function init() {
    document.querySelectorAll('[data-track-cta]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('install_click', { location: el.getAttribute('data-track-cta') });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
