'use strict';
const fs = require('fs');
const path = require('path');
const { test, ok, eq, includes } = require('./harness.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// CACHE HONESTY: the ?v= stamps in index.html and the service worker's
// VERSION must move in lockstep, and every local asset index.html loads
// must be in the precache list.
test('pwa: index.html ?v= stamps match sw.js VERSION exactly', () => {
  const index = read('index.html');
  const sw = read('sw.js');
  const versionMatch = sw.match(/const VERSION = '([^']+)'/);
  ok(versionMatch, 'sw.js must declare const VERSION = \'...\'');
  const version = versionMatch[1];
  const stamps = index.match(/\?v=([\w.-]+)/g) || [];
  ok(stamps.length > 0, 'index.html should version-stamp its assets');
  for (const s of stamps) {
    eq(s, `?v=${version}`, `index.html stamp ${s} out of lockstep with sw VERSION ${version}`);
  }
});

test('pwa: every script/css/page index.html references is precached', () => {
  const index = read('index.html');
  const sw = read('sw.js');
  const refs = [];
  const re = /(?:src|href)="((?:js|css)\/[^"?]+|manifest\.webmanifest|parents\.html|teachers\.html|assets\/[^"?]+)(\?v=[\w.-]+)?"/g;
  let m;
  while ((m = re.exec(index))) refs.push(m[1]);
  ok(refs.length > 5, `expected many local asset refs, found ${refs.length}`);
  for (const r of refs) {
    includes(sw, `'${r}`, `sw.js precache is missing ${r}`);
  }
});

test('pwa: every sw.js precache entry exists on disk', () => {
  const sw = read('sw.js');
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  ok(m, 'sw.js must declare an ASSETS array');
  const entries = (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  ok(entries.length > 10, `suspiciously few precache entries: ${entries.length}`);
  for (const e of entries) {
    ok(fs.existsSync(path.join(root, e)), `sw.js precaches missing file: ${e} — cache.addAll would fail atomically`);
  }
});

test('pwa: service worker never serves a non-index page for navigations to the app root', () => {
  const sw = read('sw.js');
  includes(sw, `'index.html'`, 'navigation fallback must be index.html');
});

test('pwa: all core modules are loaded by index.html', () => {
  const index = read('index.html');
  for (const mod of ['rng', 'stats', 'sim', 'chartscale', 'kidcode', 'missions', 'save']) {
    includes(index, `js/core/${mod}.js`, `index.html forgot js/core/${mod}.js`);
  }
});

// ACCESSIBILITY smoke checks (static): base font size and aria-live exist.
test('a11y: stylesheet keeps instructional text at 14px or larger', () => {
  const css = read('css/style.css');
  const sizes = css.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) || [];
  for (const s of sizes) {
    const px = parseFloat(s.match(/(\d+(?:\.\d+)?)px/)[1]);
    ok(px >= 14, `found a font-size of ${px}px — too small for young readers`);
  }
});

test('a11y: the notebook has exactly one polite live region for chart summaries', () => {
  const index = read('index.html');
  const lives = index.match(/aria-live="polite"/g) || [];
  ok(lives.length >= 1, 'chart summary needs an aria-live region');
  ok(lives.length <= 2, 'aria-live should be used sparingly');
});

test('a11y: reduced motion is respected in CSS', () => {
  includes(read('css/style.css'), 'prefers-reduced-motion', 'CSS must honor prefers-reduced-motion');
});
