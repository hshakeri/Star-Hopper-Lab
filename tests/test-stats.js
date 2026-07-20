'use strict';
const { test, ok, eq, near } = require('./harness.js');
const stats = require('../js/core/stats.js');
const { makeRNG } = require('../js/core/rng.js');

test('stats: mean, count, biggest, smallest, median, halfRange', () => {
  const v = [2, 4, 6, 8];
  eq(stats.mean(v), 5);
  eq(stats.count(v), 4);
  eq(stats.biggest(v), 8);
  eq(stats.smallest(v), 2);
  eq(stats.median(v), 5);
  eq(stats.median([1, 2, 100]), 2);
  eq(stats.halfRange(v), 3);
  ok(Number.isNaN(stats.mean([])), 'mean of nothing is NaN, not a lie');
});

test('stats: linearFit recovers an exact line', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = xs.map((x) => 1.5 + 4 * x);
  const fit = stats.linearFit(xs, ys);
  near(fit.slope, 4, 1e-9);
  near(fit.intercept, 1.5, 1e-9);
  for (const r of fit.residuals) near(r, 0, 1e-9);
});

test('stats: linearFit handles noisy data reasonably', () => {
  const rng = makeRNG(5);
  const xs = [];
  const ys = [];
  for (let i = 1; i <= 40; i++) {
    xs.push(i);
    ys.push(2 + 3 * i + rng.noise(1));
  }
  const fit = stats.linearFit(xs, ys);
  near(fit.slope, 3, 0.05);
  near(fit.intercept, 2, 1.0);
});

test('stats: linearFit refuses degenerate input honestly', () => {
  eq(stats.linearFit([1], [2]), null, 'one point is not a line');
  eq(stats.linearFit([3, 3, 3], [1, 2, 3]), null, 'vertical data has no slope to report');
});

test('stats: sampleWithoutReplacement is fair-sized, unique, seeded', () => {
  const rng = makeRNG(11);
  const items = [];
  for (let i = 0; i < 200; i++) items.push(i);
  const s = stats.sampleWithoutReplacement(rng, items, 12);
  eq(s.length, 12);
  eq(new Set(s).size, 12, 'sample must not repeat critters');
  const s2 = stats.sampleWithoutReplacement(makeRNG(11), items, 12);
  eq(s.join(','), s2.join(','), 'same seed, same sample');
});

test('stats: sampling more than exists fails with a friendly message', () => {
  let msg = '';
  try {
    stats.sampleWithoutReplacement(makeRNG(1), [1, 2, 3], 5);
  } catch (e) {
    msg = e.message;
    ok(e.friendly, 'error should be marked friendly');
  }
  ok(msg.indexOf('more than there are') >= 0, `unexpected message: ${msg}`);
});
