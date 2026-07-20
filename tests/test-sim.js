'use strict';
const { test, ok, eq, near } = require('./harness.js');
const sim = require('../js/core/sim.js');

test('sim: same inputs give an identical trace hash (determinism)', () => {
  const a = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS });
  const b = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS });
  eq(sim.traceHash(a.trace), sim.traceHash(b.trace), 'same jump, different trace');
  eq(a.distance, b.distance);
});

test('sim: same wind seed gives the identical storm', () => {
  const j1 = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS, wind: sim.makeWind(777, 4) });
  const j2 = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS, wind: sim.makeWind(777, 4) });
  eq(sim.traceHash(j1.trace), sim.traceHash(j2.trace), 'same seed must replay the same storm');
});

test('sim: different wind seeds give different jumps', () => {
  const j1 = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS, wind: sim.makeWind(1, 4) });
  const j2 = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS, wind: sim.makeWind(2, 4) });
  ok(sim.traceHash(j1.trace) !== sim.traceHash(j2.trace), 'two storms should differ');
});

test('sim: different engines land at different distances', () => {
  const hashes = new Set();
  for (let e = 1; e <= 10; e++) {
    hashes.add(sim.traceHash(sim.simulateJump({ engine: e, params: sim.TERRA_PARAMS }).trace));
  }
  eq(hashes.size, 10, 'each engine setting should have a distinct trace');
});

test('sim: Terra law is exactly linear — +1 engine adds the same distance', () => {
  const d = [];
  for (let e = 1; e <= 10; e++) {
    d.push(sim.simulateJump({ engine: e, params: sim.TERRA_PARAMS }).rawDistance);
  }
  const gap = d[1] - d[0];
  for (let i = 2; i < d.length; i++) {
    near(d[i] - d[i - 1], gap, 1e-9, `gap between engine ${i} and ${i + 1} drifted`);
  }
  near(gap, sim.TERRA_PARAMS.vxPerEngine, 1e-9, 'gap should equal the hidden slope');
});

test('sim: trace starts at the pad and ends exactly on the ground', () => {
  const j = sim.simulateJump({ engine: 7, params: sim.TERRA_PARAMS });
  eq(j.trace[0].x, 0);
  eq(j.trace[0].y, 0);
  eq(j.trace[j.trace.length - 1].y, 0, 'the last trace point must be the landing');
  ok(j.apex > 0, 'Hopper should actually leave the ground');
  ok(!j.timedOut, 'jump must land, not time out');
});

test('sim: engine clamps to 1..10 and reports it honestly', () => {
  const j = sim.simulateJump({ engine: 99, params: sim.TERRA_PARAMS });
  eq(j.engine, 10);
  eq(j.clamped, true);
  eq(j.requestedEngine, 99);
  const k = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS });
  eq(k.clamped, false);
});

// STATISTICAL HONESTY: wind shifts single jumps but not the long-run average.
test('honesty: wind is fair — mean effect over 400 storms ≈ 0', () => {
  const calm = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS }).rawDistance;
  let sum = 0;
  const n = 400;
  let variedOnce = false;
  for (let s = 0; s < n; s++) {
    const d = sim.simulateJump({ engine: 5, params: sim.TERRA_PARAMS, wind: sim.makeWind(s * 31 + 5, 4) }).rawDistance;
    if (Math.abs(d - calm) > 0.05) variedOnce = true;
    sum += d - calm;
  }
  ok(variedOnce, 'wind should actually move the landings');
  near(sum / n, 0, 0.25, 'wind must not secretly favor a direction');
});

test('sim: mystery params are deterministic per seed and kid-friendly', () => {
  const a = sim.mysteryTerraParams(123);
  const b = sim.mysteryTerraParams(123);
  eq(JSON.stringify(a), JSON.stringify(b), 'same seed, same mystery');
  const c = sim.mysteryTerraParams(456);
  ok(a.vxPerEngine !== c.vxPerEngine || a.vxBase !== c.vxBase, 'different seeds should differ (usually)');
  for (let s = 0; s < 50; s++) {
    const p = sim.mysteryTerraParams(s);
    ok(p.vxPerEngine >= 2.5 && p.vxPerEngine <= 4.5, 'slope out of kid range');
    ok(p.vxBase >= 0 && p.vxBase <= 4.0, 'intercept out of kid range');
  }
});
