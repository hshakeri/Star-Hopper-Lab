'use strict';
const { test, ok, eq, near } = require('./harness.js');
const missions = require('../js/core/missions.js');
const sim = require('../js/core/sim.js');
const { makeRNG } = require('../js/core/rng.js');

// single source of truth: the same constant the canvas renderer consumes
const WORLD_WIDTH_M = missions.WORLD_WIDTH_M;

// BALANCE: every official-run target must have >= 2 winning whole-metre
// predictions, and near-misses must be visibly off (>= 20 px).
test('sweep: canonical Terra — ≥2 winners and visible near-misses for every target', () => {
  const report = missions.solvabilitySweep(missions.TERRA_M1, sim.TERRA_PARAMS, WORLD_WIDTH_M);
  for (const t of report.targets) {
    ok(t.winners.length >= 2, `engine ${t.engine}: only ${t.winners.length} winning predictions`);
    ok(t.nearestLossPx >= 20, `engine ${t.engine}: near-miss only ${t.nearestLossPx}px off — too subtle`);
    ok(t.fitsWorld, `engine ${t.engine}: lands at ${t.distance} m, off the canvas`);
  }
  ok(report.ok);
});

test('sweep: mystery variants stay solvable across 100 seeds', () => {
  for (let s = 0; s < 100; s++) {
    const params = sim.mysteryTerraParams(s);
    const report = missions.solvabilitySweep(missions.TERRA_M1, params, WORLD_WIDTH_M);
    ok(report.ok, `mystery seed ${s} produced an unfair mission`);
  }
});

// STATISTICAL HONESTY: the intended method (collect + fit) must recover the
// hidden rule within tolerance for >= 95% of seeds, inside the trial budget.
test('honesty: collect-and-fit recovers the hidden Engine Law for ≥95% of 200 seeds', () => {
  const budgetEngines = [1, 3, 5, 7, 9]; // 5 trials — well within a kid session
  let recovered = 0;
  const N = 200;
  for (let s = 0; s < N; s++) {
    const params = sim.mysteryTerraParams(s);
    const fit = missions.recoverEngineLaw(params, budgetEngines);
    if (fit && Math.abs(fit.slope - params.vxPerEngine) <= 0.1 &&
        Math.abs(fit.intercept - params.vxBase) <= 0.5) {
      recovered++;
    }
  }
  ok(recovered / N >= 0.95, `only ${recovered}/${N} seeds recovered the law`);
});

test('missions: prediction scoring — stars, band, px offset', () => {
  const m = missions.TERRA_M1;
  eq(missions.evaluatePrediction(m, 29.5, 29.5).stars, 3);
  eq(missions.evaluatePrediction(m, 29.5, 30.4).stars, 3);
  eq(missions.evaluatePrediction(m, 29.5, 31.2).stars, 2);
  const miss = missions.evaluatePrediction(m, 29.5, 33.5);
  eq(miss.stars, 1);
  eq(miss.withinBand, false);
  ok(miss.pxOff >= 20, 'a miss must be visibly off');
  near(missions.evaluatePrediction(m, 25, 29.5).errorM, 4.5, 1e-9);
});

test('missions: target engine is untested and prefers the interior', () => {
  const m = missions.TERRA_M1;
  for (let s = 0; s < 50; s++) {
    const rng = makeRNG(s);
    const tested = [2, 5, 9];
    const t = missions.chooseTargetEngine(m, tested, rng);
    ok(tested.indexOf(t) < 0, `picked an already-tested engine: ${t}`);
    ok(t > 2 && t < 9, `should prefer interior values, got ${t}`);
  }
  // all-interior-tested: falls back to outside values
  const t2 = missions.chooseTargetEngine(m, [2, 3, 4, 5, 6, 7, 8, 9], makeRNG(1));
  ok(t2 === 1 || t2 === 10, `expected 1 or 10, got ${t2}`);
  // everything tested: still returns something sane
  const t3 = missions.chooseTargetEngine(m, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], makeRNG(2));
  ok(t3 >= 1 && t3 <= 10);
});

test('missions: the renderer consumes the SAME scale constants the sweep verifies', () => {
  const fs = require('fs');
  const path = require('path');
  const worldSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'game', 'world.js'), 'utf8');
  ok(worldSrc.indexOf('window.SHL.missions.PX_PER_M') >= 0,
    'world.js must read PX_PER_M from the missions module, not redeclare it');
  ok(worldSrc.indexOf('window.SHL.missions.WORLD_WIDTH_M') >= 0,
    'world.js must read WORLD_WIDTH_M from the missions module, not redeclare it');
  eq(missions.WORLD_WIDTH_M, 52);
  eq(missions.PX_PER_M, 12);
});

test('missions: locked variables are declared for the fair-test display', () => {
  ok(missions.TERRA_M1.lockedVars.length >= 1, 'fair tests must show what is locked');
  for (const v of missions.TERRA_M1.lockedVars) {
    ok(v.name && v.note === 'locked', 'locked vars need a name and a locked note');
  }
});
