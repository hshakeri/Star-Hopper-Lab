'use strict';
const { test, ok, eq, near } = require('./harness.js');
const cs = require('../js/core/chartscale.js');

// CHART HONESTY: value axes include zero by default.
test('honesty: scales include zero unless a break is explicitly flagged', () => {
  const s = cs.niceScale(30, 45);
  eq(s.min, 0, 'default axis must start at zero');
  eq(s.axisBreak, false);
  ok(s.max >= 45, 'axis must contain the data');
});

test('honesty: a zoomed axis that omits zero must carry the break flag', () => {
  const s = cs.niceScale(30, 45, { forceZero: false });
  ok(s.min > 0, 'zoomed scale should hug the data');
  eq(s.axisBreak, true, 'omitting zero without a break mark is lying');
});

test('chartscale: ticks are evenly spaced, tidy, and span the data', () => {
  const s = cs.niceScale(0, 41.5);
  ok(s.ticks.length >= 3 && s.ticks.length <= 12, `odd tick count: ${s.ticks.length}`);
  for (let i = 1; i < s.ticks.length; i++) {
    near(s.ticks[i] - s.ticks[i - 1], s.step, 1e-6, 'uneven ticks');
  }
  eq(s.ticks[0], s.min);
  ok(s.ticks[s.ticks.length - 1] >= 41.5, 'last tick must reach the data');
});

test('chartscale: degenerate inputs do not explode', () => {
  const s = cs.niceScale(5, 5);
  ok(s.max > s.min, 'flat data still gets a real axis');
  const t = cs.niceScale(NaN, NaN);
  ok(isFinite(t.min) && isFinite(t.max), 'NaN input gets a sane default axis');
});

// CHART HONESTY: sensible rounding, no fake precision.
test('honesty: formatValue rounds to at most one decimal', () => {
  eq(cs.formatValue(29.5), '29.5');
  eq(cs.formatValue(30), '30');
  eq(cs.formatValue(29.50001), '29.5');
  eq(cs.formatValue(29.97), '30');
  eq(cs.formatValue(0), '0');
  eq(cs.formatValue(NaN), '?');
});

test('chartscale: one-line summaries for screen readers', () => {
  eq(cs.summarize([], { noun: 'jumps' }), 'no jumps yet');
  eq(cs.summarize([42], { noun: 'jumps', unit: 'm' }), '1 jump · 42 m');
  const s = cs.summarize([36, 42, 48], { noun: 'jumps', unit: 'm' });
  eq(s, '3 jumps · typical 42 m · spread ±6 m');
});
