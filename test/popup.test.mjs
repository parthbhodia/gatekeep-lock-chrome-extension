// Unit test for popup.js domain escaping (defensive hardening).
//
// Context: in the SHIPPED UI this is latent, not a live exploit —
//   • renderStats (the only render path without a cleanDomain gate) is currently
//     commented out of popup.html ("Stats panel hidden for now").
//   • renderSiteLimits / renderExcludedSites run domains through isValidDomain
//     (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/), which rejects every HTML-special char.
// The escaping is correct defense-in-depth for when stats is re-enabled or a
// future code path feeds an unvalidated value. This test verifies (a) the real
// escapeHTML function behaves correctly and (b) the render paths are wired to it.

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

// Extract and instantiate the REAL escapeHTML from popup.js source.
const match = source.match(/function escapeHTML\(value\) \{[\s\S]*?\n\}/);
if (!match) { console.error('Could not locate escapeHTML in popup.js'); process.exit(2); }
const escapeHTML = new Function(`return (${match[0]})`)();

// 1) Behavior: every HTML-significant character is neutralised.
const hostile = `<img src=x onerror="alert(1)">a&b'c`;
const escaped = escapeHTML(hostile);
ok('escapes angle brackets', !/[<>]/.test(escaped), `got: ${escaped}`);
ok('escapes ampersand', escaped.includes('&amp;'));
ok('escapes double quote', escaped.includes('&quot;') && !escaped.includes('"'));
ok('escapes single quote', escaped.includes('&#39;') && !escaped.includes("'"));
ok('no raw <img survives', !escaped.includes('<img'));

// 2) Benign domains pass through unchanged.
ok('benign domain unchanged', escapeHTML('github.com') === 'github.com');
ok('subdomain unchanged', escapeHTML('news.ycombinator.com') === 'news.ycombinator.com');

// 3) Wiring: each render path escapes the domain it interpolates into innerHTML.
ok('renderStats escapes the domain',
  /const safeDomain = escapeHTML\(domain\);/.test(source) &&
  /title="\$\{safeDomain\}">\$\{safeDomain\}/.test(source));
ok('renderSiteLimits escapes domain + data-d',
  /title="\$\{escapeHTML\(domain\)\}">\$\{escapeHTML\(domain\)\}/.test(source) &&
  /data-d="\$\{escapeHTML\(domain\)\}"/.test(source));
ok('no unescaped `>${domain}<` interpolation remains in innerHTML',
  !/>\$\{domain\}</.test(source));

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
