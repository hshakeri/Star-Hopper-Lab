/* Star Hopper Lab — chart scale & honesty rules.
 * Charts never lie: value axes start at zero unless an explicit break mark
 * is shown, ticks are "nice" numbers, values are rounded to at most one
 * decimal (no fake precision), and every chart can describe itself in one
 * plain sentence for screen readers.
 * Runs in browser (window.SHL.chartscale) and Node (module.exports).
 */
(function () {
  'use strict';

  const statsMod = (typeof module !== 'undefined' && module.exports)
    ? require('./stats.js')
    : (window.SHL && window.SHL.stats);

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }

  function tidy(v) { return parseFloat(v.toFixed(6)); }

  /* niceScale(min, max, { forceZero, maxTicks }) ->
   *   { min, max, step, ticks, axisBreak }
   * forceZero: value axes (dot plots, bars) must include zero.
   * axisBreak: true when a zoomed axis omits zero — the renderer MUST draw
   * an explicit break mark in that case.
   */
  function niceScale(minV, maxV, opts) {
    const o = opts || {};
    const forceZero = o.forceZero !== false; // default true: honest by default
    const maxTicks = o.maxTicks || 6;
    let min = isFinite(minV) ? minV : 0;
    let max = isFinite(maxV) ? maxV : 1;
    if (min > max) { const t = min; min = max; max = t; }
    if (forceZero && min > 0) min = 0;
    if (forceZero && max < 0) max = 0;
    if (min === max) max = min + 1;
    const step = niceNum(niceNum(max - min, false) / (maxTicks - 1), true);
    const lo = tidy(Math.floor(min / step) * step);
    const hi = tidy(Math.ceil(max / step) * step);
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(tidy(v));
    return { min: lo, max: hi, step, ticks, axisBreak: !forceZero && lo > 0 };
  }

  // Sensible rounding: at most one decimal, no trailing ".0".
  function formatValue(v) {
    if (!isFinite(v)) return '?';
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  /* One-line text summary for screen readers and the notebook footer:
   *   "10 jumps · typical 42 m · spread ±6 m"
   */
  function summarize(values, opts) {
    const o = opts || {};
    const unit = o.unit || 'm';
    const noun = o.noun || 'jumps';
    const singular = o.singular || noun.replace(/s$/, '');
    if (!values.length) return `no ${noun} yet`;
    if (values.length === 1) return `1 ${singular} · ${formatValue(values[0])} ${unit}`;
    const typical = statsMod.mean(values);
    const spread = statsMod.halfRange(values);
    return `${values.length} ${noun} · typical ${formatValue(typical)} ${unit} · spread ±${formatValue(spread)} ${unit}`;
  }

  const api = { niceScale, niceNum, formatValue, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.chartscale = api; }
})();
