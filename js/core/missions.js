/* Star Hopper Lab — mission logic (pure).
 * Everything a mission needs to be *fair* lives here so Node sweep tests can
 * verify it: tolerance bands, star rules, target selection, solvability.
 * Runs in browser (window.SHL.missions) and Node (module.exports).
 */
(function () {
  'use strict';

  const isNode = (typeof module !== 'undefined' && module.exports);
  const simMod = isNode ? require('./sim.js') : (window.SHL && window.SHL.sim);
  const statsMod = isNode ? require('./stats.js') : (window.SHL && window.SHL.stats);

  // World rendering scale and width — the SINGLE source of truth shared by
  // the canvas renderer (js/game/world.js), the near-miss-visibility sweep,
  // and the tests. 12 px per metre; the field is 52 m wide.
  const PX_PER_M = 12;
  const WORLD_WIDTH_M = 52;

  const TERRA_M1 = {
    id: 'terra-1',
    worldId: 'terra',
    worldName: 'Terra Data',
    title: 'The Engine Law',
    concept: 'measurement & variables',
    question: 'What does hopper.engine do to how far Hopper jumps?',
    unit: 'm',
    minDistinctSettings: 3,   // collect at least 3 different engine values
    toleranceM: 2.0,          // official-run band: |prediction - landing| <= 2 m
    greatM: 1.0,              // 3-star closeness
    pxPerM: PX_PER_M,
    engineMin: 1,
    engineMax: 10,
    lockedVars: [
      { name: 'gravity', value: '10', note: 'locked' },
      { name: 'mass', value: '1', note: 'locked' },
    ],
  };

  /* Pick the engine value for the official run: an untested setting,
   * preferring one strictly inside the range the player explored
   * (quietly seeding the idea of interpolation). Seeded rng => replayable.
   */
  function chooseTargetEngine(mission, testedEngines, rng) {
    const tested = new Set(testedEngines.map(Number));
    const inside = [];
    const outside = [];
    const mn = Math.min.apply(null, testedEngines);
    const mx = Math.max.apply(null, testedEngines);
    for (let e = mission.engineMin; e <= mission.engineMax; e++) {
      if (tested.has(e)) continue;
      if (e > mn && e < mx) inside.push(e);
      else outside.push(e);
    }
    // if every engine has been tested there is nothing untested to offer;
    // pick any setting (the UI must then say "one you already know")
    const pool = inside.length ? inside : outside;
    if (!pool.length) return rng.int(mission.engineMin, mission.engineMax);
    return pool[Math.floor(rng.next() * pool.length)];
  }

  /* Score one official run.  errorM uses notebook precision (0.1 m). */
  function evaluatePrediction(mission, predictedM, landedM) {
    const errorM = Math.round(Math.abs(predictedM - landedM) * 10) / 10;
    const withinBand = errorM <= mission.toleranceM;
    const stars = errorM <= mission.greatM ? 3 : (withinBand ? 2 : 1);
    return { errorM, withinBand, stars, pxOff: errorM * mission.pxPerM };
  }

  /* Fairness sweep, run by tests AND runnable by hand:
   * for every possible official-run engine, with the given params:
   *   - at least 2 whole-metre predictions win (inside the band)
   *   - the nearest losing whole-metre prediction is visibly off:
   *     >= 20 px from target AND outside the drawn band
   *   - the landing fits on the world canvas
   */
  function solvabilitySweep(mission, params, worldWidthM) {
    const report = { ok: true, targets: [] };
    for (let e = mission.engineMin; e <= mission.engineMax; e++) {
      const jump = simMod.simulateJump({ engine: e, params });
      const d = jump.distance;
      const winners = [];
      let nearestLossErr = Infinity;
      for (let p = 0; p <= Math.ceil(worldWidthM); p++) {
        const r = evaluatePrediction(mission, p, d);
        if (r.withinBand) winners.push(p);
        else nearestLossErr = Math.min(nearestLossErr, r.errorM);
      }
      const entry = {
        engine: e,
        distance: d,
        winners,
        nearestLossPx: nearestLossErr * mission.pxPerM,
        fitsWorld: d <= worldWidthM,
      };
      entry.ok = winners.length >= 2 && entry.nearestLossPx >= 20 && entry.fitsWorld;
      if (!entry.ok) report.ok = false;
      report.targets.push(entry);
    }
    return report;
  }

  /* The intended method for Terra: collect distances at several engine
   * settings, fit a line, read the slope. Used by the recovery test:
   * across seeds/variants, does the method find the hidden rule?
   */
  function recoverEngineLaw(params, engines) {
    const xs = [];
    const ys = [];
    for (const e of engines) {
      xs.push(e);
      ys.push(simMod.simulateJump({ engine: e, params }).distance);
    }
    return statsMod.linearFit(xs, ys);
  }

  const api = { PX_PER_M, WORLD_WIDTH_M, TERRA_M1, chooseTargetEngine, evaluatePrediction, solvabilitySweep, recoverEngineLaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.missions = api; }
})();
