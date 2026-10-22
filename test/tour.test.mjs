// Unit test for the first-run tour in popup.js: it must show once, not on every popup open.
//
// Context: the "seen" flag used to be written only by Skip, Done and Esc. A Chrome popup
// closes the moment it loses focus, so anyone who clicked away mid-tour never wrote it and
// got the tour again on every open. Loads the REAL initTour from popup.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ pass: Boolean(cond) });
  console.log(`${cond ? '  PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const keyMatch = source.match(/const TOUR_STORAGE_KEY = '([^']+)';/);
const fnMatch = source.match(/async function initTour\(\) \{[\s\S]*?\r?\n\}/);
if (!keyMatch || !fnMatch) { console.error('Could not locate initTour / TOUR_STORAGE_KEY in popup.js'); process.exit(2); }
const KEY = keyMatch[1];

/** Run the real initTour against an in-memory chrome.storage.local. */
function makePopup({ failGet = false, failSet = false } = {}) {
  const store = {};
  const opened = [];
  const chrome = {
    storage: {
      local: {
        get: async (k) => { if (failGet) throw new Error('storage unavailable'); return { [k]: store[k] }; },
        set: async (o) => { if (failSet) throw new Error('storage unavailable'); Object.assign(store, o); }
      }
    }
  };
  const initTour = new Function('chrome', 'openTour', 'TOUR_STORAGE_KEY', `return (${fnMatch[0]})`)(
    chrome, (step) => opened.push(step), KEY
  );
  return { store, opened, initTour };
}

async function main() {
  // 1) First ever open: the tour shows, and that alone counts as seen — no Skip/Done/Esc needed.
  const first = makePopup();
  await first.initTour();
  ok('first open shows the tour from step 0', first.opened.length === 1 && first.opened[0] === 0);
  ok('first open marks it seen, even if the popup is closed without finishing', first.store[KEY] === true);

  // 2) Every later open (same storage): no tour.
  const again = makePopup();
  again.store[KEY] = true;
  await again.initTour();
  ok('next open does not show the tour', again.opened.length === 0);

  // 3) The flag a user already has from clicking Done/Skip keeps working.
  ok('uses the same storage key as before, so existing users stay opted out', KEY === 'catBreakTourCompleted');

  // 4) Storage trouble never breaks the popup.
  const noRead = makePopup({ failGet: true });
  let threw = false;
  try { await noRead.initTour(); } catch { threw = true; }
  ok('unreadable storage: popup still loads, no tour', !threw && noRead.opened.length === 0);

  const noWrite = makePopup({ failSet: true });
  threw = false;
  try { await noWrite.initTour(); } catch { threw = true; }
  ok('unwritable storage: tour still shows, no crash', !threw && noWrite.opened.length === 1);

  // 5) The Tour button must keep working after the flag is set: replay goes straight to openTour.
  ok('Tour button replays without consulting the flag', /tourReplay\.addEventListener\('click', \(\) => openTour\(0\)\)/.test(source));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
