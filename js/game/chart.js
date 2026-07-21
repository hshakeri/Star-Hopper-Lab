/* Star Hopper Lab — the Field Notebook's live dot plot.
 * Chart honesty is enforced here: labeled axes, zero baseline (this is a
 * value axis), sensible rounding, and a one-line text summary for screen
 * readers. The "gap brackets" make Terra's aha visible: equal gaps between
 * dots = "+1 engine adds the same distance".
 */
(function () {
  'use strict';

  const cs = window.SHL.chartscale;

  const COLORS = {
    axis: '#8fa3c8',
    grid: 'rgba(143,163,200,0.15)',
    dot: '#54e0ff',
    dotEdge: '#0b2740',
    label: '#cfe3ff',
    band: 'rgba(255,204,74,0.18)',
    bandEdge: 'rgba(255,204,74,0.7)',
    predict: '#ffcc4a',
    ghost: '#8fa3c8',
    gap: '#7dffa8',
  };

  /* trials: [{ engine|null, distance }]
   * opts: { predictedM, toleranceM, prevOfficialM, showGaps, snap, title }
   * returns the one-line summary string (also good for aria-live).
   */
  function renderDotPlot(canvas, trials, opts) {
    const o = opts || {};
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const L = 40, R = 14, T = 26, B = 44;
    const innerW = W - L - R;
    const baseline = H - B;

    ctx.clearRect(0, 0, W, H);
    ctx.font = '15px ui-monospace, Menlo, monospace';

    const values = trials.map((t) => t.distance);
    const dataMax = values.length ? Math.max.apply(null, values) : 10;
    // the axis must contain everything drawn on it, including the whole
    // prediction band — a band running off the edge would lie about its width
    const extra = Math.max(
      o.predictedM != null && o.toleranceM != null ? o.predictedM + o.toleranceM : 0,
      o.predictedM || 0,
      o.prevOfficialM || 0
    );
    const scale = cs.niceScale(0, Math.max(10, dataMax, extra), { forceZero: true });
    const xpx = (v) => L + ((v - scale.min) / (scale.max - scale.min)) * innerW;
    const clampTextX = (x) => Math.min(W - R - 8, Math.max(L + 8, x));

    // title
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.fillText(o.title || "Hopper's jumps", L, 16);

    // axis + ticks (always labeled — charts never lie)
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, baseline + 0.5);
    ctx.lineTo(W - R, baseline + 0.5);
    ctx.stroke();
    ctx.textAlign = 'center';
    for (const tick of scale.ticks) {
      const x = xpx(tick);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, T + 4);
      ctx.lineTo(x, baseline);
      ctx.stroke();
      ctx.strokeStyle = COLORS.axis;
      ctx.beginPath();
      ctx.moveTo(x, baseline);
      ctx.lineTo(x, baseline + 5);
      ctx.stroke();
      ctx.fillStyle = COLORS.axis;
      ctx.fillText(cs.formatValue(tick), x, baseline + 20);
    }
    ctx.fillStyle = COLORS.label;
    ctx.fillText('Landing distance (m)', L + innerW / 2, H - 8);

    // prediction band + marker (drawn under the dots)
    if (o.predictedM != null && o.toleranceM != null) {
      const x1 = xpx(Math.max(scale.min, o.predictedM - o.toleranceM));
      const x2 = xpx(Math.min(scale.max, o.predictedM + o.toleranceM));
      ctx.fillStyle = COLORS.band;
      ctx.fillRect(x1, T + 4, x2 - x1, baseline - T - 4);
      ctx.strokeStyle = COLORS.bandEdge;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, T + 4, x2 - x1, baseline - T - 4);
      ctx.setLineDash([]);
      const xp = xpx(o.predictedM);
      ctx.strokeStyle = COLORS.predict;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xp, T + 4);
      ctx.lineTo(xp, baseline);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = COLORS.predict;
      ctx.textAlign = 'center';
      ctx.fillText('your prediction', clampTextX(xp), T);
    }

    // previous official attempt (ghost)
    if (o.prevOfficialM != null) {
      const xg = xpx(o.prevOfficialM);
      ctx.strokeStyle = COLORS.ghost;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(xg, T + 10);
      ctx.lineTo(xg, baseline);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.ghost;
      ctx.fillText('last try', xg, T + 8);
    }

    // dots, stacked in 0.5 m bins and drawn at the bin centre (a standard
    // binned dot plot: every trial visible, none drawn on top of another)
    const counts = {};
    for (const t of trials) {
      const bin = Math.round(t.distance * 2) / 2;
      counts[bin] = (counts[bin] || 0) + 1;
    }
    const tallest = Math.max.apply(null, [1].concat(Object.keys(counts).map((b) => counts[b])));
    // squeeze the stack spacing so even a huge pile of repeats stays on the
    // canvas — repeated trials must never silently vanish
    const spacing = Math.min(15, (baseline - T - 34) / tallest);
    const stacks = {};
    for (const t of trials) {
      const bin = Math.round(t.distance * 2) / 2;
      stacks[bin] = (stacks[bin] || 0) + 1;
      const x = xpx(bin);
      const y = baseline - 10 - (stacks[bin] - 1) * spacing;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(5.5, Math.max(2.5, spacing / 2.5)), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.dot;
      ctx.fill();
      ctx.strokeStyle = COLORS.dotEdge;
      ctx.stroke();
      if (t.engine != null && stacks[bin] === 1) {
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = 'center';
        ctx.fillText('e' + t.engine, x, baseline - 10 - counts[bin] * spacing - 6);
      }
    }

    // gap brackets between consecutive distinct engine settings — Terra's aha
    if (o.showGaps) {
      const byEngine = {};
      for (const t of trials) {
        if (t.engine != null) byEngine[t.engine] = t.distance;
      }
      const engines = Object.keys(byEngine).map(Number).sort((a, b) => a - b);
      const gapY = T + 22;
      for (let i = 1; i < engines.length; i++) {
        // only bracket *adjacent* engine settings: a fair "+1" comparison
        if (engines[i] - engines[i - 1] !== 1) continue;
        // bracket ends align with the drawn (bin-centred) dots; the printed
        // gap number stays the exact measured difference
        const a = xpx(Math.round(byEngine[engines[i - 1]] * 2) / 2);
        const b = xpx(Math.round(byEngine[engines[i]] * 2) / 2);
        const gap = byEngine[engines[i]] - byEngine[engines[i - 1]];
        ctx.strokeStyle = o.snap ? COLORS.gap : COLORS.axis;
        ctx.beginPath();
        ctx.moveTo(a, gapY);
        ctx.lineTo(a, gapY - 5);
        ctx.moveTo(a, gapY);
        ctx.lineTo(b, gapY);
        ctx.moveTo(b, gapY);
        ctx.lineTo(b, gapY - 5);
        ctx.stroke();
        ctx.fillStyle = o.snap ? COLORS.gap : COLORS.axis;
        ctx.textAlign = 'center';
        ctx.fillText('+' + cs.formatValue(gap), (a + b) / 2, gapY + 14);
      }
      if (o.snap && engines.length >= 3) {
        ctx.fillStyle = COLORS.gap;
        ctx.textAlign = 'right';
        ctx.fillText('same gap every time!', W - R, 16);
      }
    }

    return cs.summarize(values, { unit: 'm', noun: 'jumps' });
  }

  window.SHL = window.SHL || {};
  window.SHL.chart = { renderDotPlot, COLORS };
})();
