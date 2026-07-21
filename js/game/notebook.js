/* Star Hopper Lab — the Field Notebook.
 * The platformer is the instrument; this is where its measurements live.
 * Every jump auto-logs here (honest data: the notebook never invents or
 * drops a point). Renders the table, the live dot plot, and the one-line
 * summary into its aria-live region.
 */
(function () {
  'use strict';

  const chart = () => window.SHL.chart;

  const state = {
    refs: null,           // { tableBody, chartCanvas, summaryEl }
    trials: [],           // { n, engine|null, distance }
    overlays: {},         // { predictedM, toleranceM, prevOfficialM, showGaps, snap }
  };

  function init(refs) {
    state.refs = refs;
  }

  function reset() {
    state.trials = [];
    state.overlays = {};
    render();
  }

  function addAuto(engine, distance) {
    state.trials.push({ n: state.trials.length + 1, engine, distance });
    render();
  }

  function addManual(value) {
    state.trials.push({ n: state.trials.length + 1, engine: null, distance: value });
    render();
  }

  function trials() { return state.trials.slice(); }
  function values() { return state.trials.map((t) => t.distance); }

  function distinctEngines() {
    const s = new Set();
    for (const t of state.trials) if (t.engine != null) s.add(t.engine);
    return s.size;
  }

  function engineDistancePairs() {
    // last measurement wins per engine (deterministic world: they agree anyway)
    const map = {};
    for (const t of state.trials) if (t.engine != null) map[t.engine] = t.distance;
    return Object.keys(map).map(Number).sort((a, b) => a - b).map((e) => ({ engine: e, distance: map[e] }));
  }

  function setOverlays(overlays) {
    state.overlays = Object.assign({}, state.overlays, overlays);
    render();
  }

  function clearOverlays() {
    state.overlays = {};
    render();
  }

  function render() {
    const r = state.refs;
    if (!r) return;
    // table (newest first so the latest measurement is visible without scrolling)
    const rows = state.trials.slice(-30).reverse().map((t) =>
      `<tr><td>${t.n}</td><td>${t.engine != null ? t.engine : '—'}</td><td>${window.SHL.chartscale.formatValue(t.distance)}</td></tr>`
    );
    r.tableBody.innerHTML = rows.join('');
    // chart + summary — only touch the aria-live region when the summary
    // actually changed, so overlay redraws (e.g. dragging the prediction
    // flag) don't spam screen readers
    const summary = chart().renderDotPlot(r.chartCanvas, state.trials, state.overlays);
    if (r.summaryEl.textContent !== summary) r.summaryEl.textContent = summary;
  }

  function chartDataURL() {
    return state.refs ? state.refs.chartCanvas.toDataURL('image/png') : null;
  }

  window.SHL = window.SHL || {};
  window.SHL.notebook = {
    init, reset, addAuto, addManual, trials, values,
    distinctEngines, engineDistancePairs, setOverlays, clearOverlays, render, chartDataURL,
  };
})();
