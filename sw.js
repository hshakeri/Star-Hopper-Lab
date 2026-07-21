/* Star Hopper Lab — service worker.
 * Per-asset precache with ?v= stamps. VERSION here and the ?v= stamps in
 * index.html are bumped in LOCKSTEP (enforced by tests/test-pwa.js).
 * Navigations are always answered with the precached index (or the
 * matching printable page) — a non-index page is never cached over it.
 */
'use strict';

const VERSION = '5';
const CACHE = 'star-hopper-lab-v' + VERSION;

const ASSETS = [
  'index.html',
  'parents.html',
  'teachers.html',
  'manifest.webmanifest',
  'assets/icon.svg',
  'css/style.css',
  'js/core/rng.js',
  'js/core/stats.js',
  'js/core/sim.js',
  'js/core/chartscale.js',
  'js/core/kidcode.js',
  'js/core/missions.js',
  'js/core/save.js',
  'js/game/jokes.js',
  'js/game/audio.js',
  'js/game/chart.js',
  'js/game/notebook.js',
  'js/game/world.js',
  'js/game/console.js',
  'js/game/journal.js',
  'js/game/main.js',
];

const stamped = (asset) => asset + '?v=' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map(stamped)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // printable pages get themselves; every other navigation gets the index
    const page = /\/(parents|teachers)\.html$/.exec(url.pathname);
    const target = page ? page[1] + '.html' : 'index.html';
    event.respondWith(
      caches.match(stamped(target)).then((hit) => hit || fetch(req))
    );
    return;
  }

  // resolve the request path relative to the SW scope so subdirectory
  // hosting (e.g. /star-hopper-lab/) still hits the precache keys
  const scopePath = new URL(self.registration.scope).pathname;
  const rel = url.pathname.indexOf(scopePath) === 0
    ? url.pathname.slice(scopePath.length)
    : url.pathname.replace(/^\//, '');
  event.respondWith(
    caches.match(stamped(rel))
      .then((hit) => hit || caches.match(req))
      .then((hit) => hit || fetch(req))
  );
});
