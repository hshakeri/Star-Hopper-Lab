/* Star Hopper Lab — seeded RNG (mulberry32).
 * Every random number in the game flows through this module: sim noise,
 * mission variants, joke shuffles. Same seed => same universe, always.
 * Runs in browser (window.SHL.rng) and Node (module.exports).
 */
(function () {
  'use strict';

  // FNV-1a string hash -> 32-bit seed
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRNG(seed) {
    const s = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
    const next = mulberry32(s);
    return {
      seed: s,
      next,                                    // uniform [0, 1)
      range(min, max) { return min + (max - min) * next(); },
      int(min, max) { return min + Math.floor(next() * (max - min + 1)); }, // inclusive
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
      },
      // Zero-mean, bounded [-amp, amp], bell-shaped (sum of 3 uniforms).
      // This is the ONLY noise source worlds are allowed to use: unbiased by construction.
      noise(amp) { return ((next() + next() + next()) - 1.5) / 1.5 * (amp || 1); },
      // Independent child stream (e.g. rng.fork('jokes')) so drawing a joke
      // never disturbs the physics stream.
      fork(label) { return makeRNG((s ^ hashString(String(label))) >>> 0); },
    };
  }

  const api = { makeRNG, mulberry32, hashString };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.rng = api; }
})();
