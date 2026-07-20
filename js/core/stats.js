/* Star Hopper Lab — statistics helpers.
 * Pure functions shared by the game, the notebook charts, and the test suite.
 * Runs in browser (window.SHL.stats) and Node (module.exports).
 */
(function () {
  'use strict';

  function sum(values) { return values.reduce((a, b) => a + b, 0); }
  function count(values) { return values.length; }
  function mean(values) { return values.length ? sum(values) / values.length : NaN; }
  function biggest(values) { return values.length ? Math.max.apply(null, values) : NaN; }
  function smallest(values) { return values.length ? Math.min.apply(null, values) : NaN; }
  function median(values) {
    if (!values.length) return NaN;
    const a = values.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  // Kid-facing "spread": half the range, as in "typical 42 m, spread ±6 m".
  function halfRange(values) { return values.length ? (biggest(values) - smallest(values)) / 2 : NaN; }

  // Ordinary least squares fit: y = intercept + slope * x
  function linearFit(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    const mx = mean(xs.slice(0, n));
    const my = mean(ys.slice(0, n));
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx;
      sxx += dx * dx;
      sxy += dx * (ys[i] - my);
    }
    if (sxx === 0) return null; // all x identical: no line to fit
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const residuals = [];
    for (let i = 0; i < n; i++) residuals.push(ys[i] - (intercept + slope * xs[i]));
    return { slope, intercept, residuals };
  }

  // Fair sample without replacement, driven by a seeded RNG from rng.js.
  // Throws (kid-friendly message) if asked for more items than exist.
  function sampleWithoutReplacement(rng, items, n) {
    if (n > items.length) {
      const err = new Error(`sample() can't pick ${n} from only ${items.length} — that's more than there are!`);
      err.friendly = true;
      throw err;
    }
    return rng.shuffle(items).slice(0, n);
  }

  const api = { sum, count, mean, biggest, smallest, median, halfRange, linearFit, sampleWithoutReplacement };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.stats = api; }
})();
