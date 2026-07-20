/* Star Hopper Lab — deterministic jump simulator.
 * Fixed-step semi-implicit Euler; ALL randomness (wind gusts) comes through
 * the seeded RNG module. Same inputs + same seed => bit-identical trace.
 * The physics never lies: constant gravity, thrust only at launch, wind is
 * a real force with zero mean.
 * Runs in browser (window.SHL.sim) and Node (module.exports).
 */
(function () {
  'use strict';

  const rngMod = (typeof module !== 'undefined' && module.exports)
    ? require('./rng.js')
    : (window.SHL && window.SHL.rng);

  const DT = 1 / 120;         // fixed step, seconds
  const MAX_TIME = 12;        // hard stop so a buggy param set can never hang

  // vy0 is calibrated so the discrete integrator touches down exactly on a
  // step boundary at t = 1.0 s (vy0 = g*(T+dt)/2 with T=1). That makes
  // Terra's law exact: distance = vxBase + vxPerEngine * engine, so
  // "+1 engine adds the same distance" is true to the last decimal.
  const TERRA_PARAMS = {
    gravity: 10,
    vy0: 10 * (1 + DT) / 2,   // 5.041666...
    vxBase: 1.5,
    vxPerEngine: 4.0,
  };

  // Mystery-dataset variants (post-completion replays): a reseeded hidden
  // rule with kid-friendly half-unit coefficients. Same concept, new numbers.
  function mysteryTerraParams(seed) {
    const r = rngMod.makeRNG(seed).fork('terra-mystery');
    return {
      gravity: 10,
      vy0: 10 * (1 + DT) / 2,
      vxBase: 0.5 * r.int(0, 8),            // 0 .. 4 m
      vxPerEngine: 2.5 + 0.5 * r.int(0, 4), // 2.5 .. 4.5 m per engine (max jump 49 m fits the world)
    };
  }

  // Seeded wind: piecewise-constant gust acceleration, redrawn every 0.25 s.
  // Each gust is rng.noise(amp): zero-mean and bounded — honest by design.
  function makeWind(seed, amp) {
    const cache = [];
    const base = rngMod.makeRNG(seed).fork('wind');
    return {
      seed, amp,
      ax(t) {
        const w = Math.floor(t / 0.25);
        while (cache.length <= w) cache.push(base.noise(amp));
        return cache[w];
      },
    };
  }

  function clampEngine(engine) {
    const e = Number(engine);
    if (!isFinite(e)) return 1;
    return Math.min(10, Math.max(1, e));
  }

  /* simulateJump({ engine, params, wind }) ->
   *   { engine, requestedEngine, clamped, distance, rawDistance, apex, airtime, trace }
   * distance is rounded to 0.1 m (sensible precision for a kid's notebook);
   * rawDistance keeps full precision for internal checks.
   */
  function simulateJump(opts) {
    const params = opts.params || TERRA_PARAMS;
    const requested = Number(opts.engine);
    const engine = clampEngine(opts.engine);
    const wind = opts.wind || null;

    let x = 0, y = 0;
    let vx = params.vxBase + params.vxPerEngine * engine;
    let vy = params.vy0;
    let t = 0;
    let apex = 0;
    const trace = [{ t: 0, x: 0, y: 0 }];

    while (t < MAX_TIME) {
      const px = x, py = y;
      if (wind) vx += wind.ax(t) * DT;
      vy -= params.gravity * DT;
      x += vx * DT;
      y += vy * DT;
      t += DT;
      if (y > apex) apex = y;
      if (y <= 0 && t > DT) {
        // interpolate the exact ground crossing of this step
        const frac = py <= 0 ? 0 : py / (py - y);
        const lx = px + (x - px) * frac;
        const lt = (t - DT) + DT * frac;
        trace.push({ t: lt, x: lx, y: 0 });
        return {
          engine,
          requestedEngine: requested,
          clamped: engine !== requested,
          rawDistance: lx,
          distance: Math.round(lx * 10) / 10,
          apex,
          airtime: lt,
          trace,
        };
      }
      trace.push({ t, x, y });
    }
    // Should be unreachable with sane params; report honestly if not.
    return {
      engine, requestedEngine: requested, clamped: engine !== requested,
      rawDistance: x, distance: Math.round(x * 10) / 10, apex, airtime: t, trace,
      timedOut: true,
    };
  }

  // FNV-1a over the rounded trace — the determinism fingerprint used in tests.
  function traceHash(trace) {
    let h = 2166136261 >>> 0;
    for (const p of trace) {
      const s = p.t.toFixed(4) + ',' + p.x.toFixed(3) + ',' + p.y.toFixed(3) + ';';
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  const api = { DT, TERRA_PARAMS, mysteryTerraParams, makeWind, simulateJump, traceHash, clampEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.sim = api; }
})();
