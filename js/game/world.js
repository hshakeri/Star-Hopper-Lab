/* Star Hopper Lab — the world canvas: retro-futuristic terrain, Hopper the
 * robot, jump animations, particles, and prediction markers.
 * The renderer is an honest instrument: a metre ruler is painted on the
 * ground, and 1 m is always exactly PX_PER_M pixels.
 */
(function () {
  'use strict';

  // scale constants come from the missions module — one source of truth,
  // so the ≥20px near-miss sweep verifies the numbers the renderer uses
  const PX_PER_M = window.SHL.missions.PX_PER_M;
  const WORLD_WIDTH_M = window.SHL.missions.WORLD_WIDTH_M;
  const ORIGIN_X = 16;            // pad edge: where distance = 0
  const GROUND_Y = 300;

  const state = {
    canvas: null, ctx: null,
    seedRng: null,
    stars: [],
    reducedMotion: false,
    hopperM: 0,                   // Hopper's current x in metres
    hopperY: 0,                   // height in metres
    facing: 1,
    anim: null,                   // running jump animation
    particles: [],
    prediction: null,             // { m, tol, committed }
    prevGhostM: null,
    lastLandingM: null,
    montageText: null,
    speed: 1,
    idleT: 0,
    rafId: null,
  };

  const mx = (m) => ORIGIN_X + m * PX_PER_M;

  function init(canvas, opts) {
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d');
    state.reducedMotion = !!(opts && opts.reducedMotion);
    loop();
  }

  function setSeed(rng) {
    state.seedRng = rng.fork('starfield');
    state.stars = [];
    for (let i = 0; i < 90; i++) {
      state.stars.push({
        x: state.seedRng.range(0, 640),
        y: state.seedRng.range(0, 260),
        r: state.seedRng.range(0.4, 1.6),
        tw: state.seedRng.range(0, Math.PI * 2),
      });
    }
  }

  function setReducedMotion(b) { state.reducedMotion = !!b; }

  // ---------- drawing ----------

  function drawBackground(ctx, t) {
    ctx.fillStyle = '#0a0e23';
    ctx.fillRect(0, 0, 640, 360);
    // stars (twinkle unless reduced motion)
    for (const s of state.stars) {
      const a = state.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t / 900 + s.tw);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe3ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // distant ringed planet
    ctx.fillStyle = '#1d2a55';
    ctx.beginPath();
    ctx.arc(560, 70, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#31427e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(560, 70, 42, 10, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawGround(ctx) {
    ctx.fillStyle = '#1b2547';
    ctx.fillRect(0, GROUND_Y, 640, 60);
    ctx.fillStyle = '#28345f';
    ctx.fillRect(0, GROUND_Y, 640, 4);
    // launch pad
    ctx.fillStyle = '#31427e';
    ctx.fillRect(ORIGIN_X - 14, GROUND_Y - 6, 28, 6);
    ctx.fillStyle = '#54e0ff';
    ctx.fillRect(ORIGIN_X - 14, GROUND_Y - 8, 28, 2);
    // metre ruler: honest instrument, ticks every 5 m, labels every 10 m
    ctx.strokeStyle = '#8fa3c8';
    ctx.fillStyle = '#8fa3c8';
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    for (let m = 0; m <= WORLD_WIDTH_M; m += 5) {
      const x = mx(m);
      if (x > 636) break;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 8);
      ctx.lineTo(x, GROUND_Y + (m % 10 === 0 ? 16 : 12));
      ctx.stroke();
      if (m % 10 === 0) ctx.fillText(m + 'm', x, GROUND_Y + 30);
    }
  }

  function drawPrediction(ctx) {
    const p = state.prediction;
    if (!p) return;
    const x1 = mx(Math.max(0, p.m - p.tol));
    const x2 = mx(p.m + p.tol);
    ctx.fillStyle = p.committed ? 'rgba(255,204,74,0.20)' : 'rgba(255,204,74,0.10)';
    ctx.fillRect(x1, GROUND_Y - 44, x2 - x1, 44);
    ctx.strokeStyle = 'rgba(255,204,74,0.8)';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x1, GROUND_Y - 44, x2 - x1, 44);
    ctx.setLineDash([]);
    // flag pole at the predicted spot
    const xp = mx(p.m);
    ctx.strokeStyle = '#ffcc4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xp, GROUND_Y);
    ctx.lineTo(xp, GROUND_Y - 56);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffcc4a';
    ctx.beginPath();
    ctx.moveTo(xp, GROUND_Y - 56);
    ctx.lineTo(xp + 16, GROUND_Y - 50);
    ctx.lineTo(xp, GROUND_Y - 44);
    ctx.fill();
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.fillText(window.SHL.chartscale.formatValue(p.m) + ' m', xp, GROUND_Y - 62);
  }

  function drawPrevGhost(ctx) {
    if (state.prevGhostM == null) return;
    const x = mx(state.prevGhostM);
    ctx.globalAlpha = 0.45;
    drawHopperSprite(ctx, x, GROUND_Y, 0, '#8fa3c8');
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8fa3c8';
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('last try', x, GROUND_Y - 40);
  }

  function drawHopperSprite(ctx, x, groundY, bounce, color) {
    const y = groundY - bounce;
    // legs
    ctx.fillStyle = '#31427e';
    ctx.fillRect(x - 8, y - 8, 5, 8);
    ctx.fillRect(x + 3, y - 8, 5, 8);
    // body
    ctx.fillStyle = color || '#54e0ff';
    ctx.fillRect(x - 11, y - 26, 22, 19);
    // visor
    ctx.fillStyle = '#0a0e23';
    ctx.fillRect(x - 7, y - 22, 14, 8);
    ctx.fillStyle = '#7dffa8';
    ctx.fillRect(x - 5 + (state.facing > 0 ? 4 : 0), y - 20, 4, 4);
    // antenna
    ctx.strokeStyle = color || '#54e0ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.lineTo(x, y - 32);
    ctx.stroke();
    ctx.fillStyle = '#ffcc4a';
    ctx.beginPath();
    ctx.arc(x, y - 33, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawThruster(ctx, x, y) {
    // flames only while thrust is actually firing (honest physics!)
    ctx.fillStyle = '#ffcc4a';
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x, y + 10 + Math.random() * 4);
    ctx.lineTo(x + 6, y);
    ctx.fill();
  }

  function drawParticles(ctx, dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
      if (p.life > 0) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function burst(m, color, count) {
    if (state.reducedMotion) return;
    const x = mx(m);
    for (let i = 0; i < (count || 14); i++) {
      state.particles.push({
        x, y: GROUND_Y - 4,
        vx: (Math.random() - 0.5) * 160,
        vy: -Math.random() * 180 - 40,
        life: 0.4 + Math.random() * 0.4,
        color: color || '#54e0ff',
      });
    }
  }

  // ---------- animation loop ----------

  let lastT = 0;

  function loop(t) {
    state.rafId = requestAnimationFrame(loop);
    const now = t || 0;
    const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
    lastT = now;
    const ctx = state.ctx;
    if (!ctx) return;

    drawBackground(ctx, now);
    drawGround(ctx);
    drawPrediction(ctx);
    drawPrevGhost(ctx);

    // active jump animation — advances on wall-clock time so throttled
    // frames (background tabs) never slow the run down or lock the UI
    const a = state.anim;
    if (a) {
      if (a.start == null) a.start = now;
      const simT = ((now - a.start) / 1000) * state.speed * (a.result.airtime / a.duration);
      const trace = a.result.trace;
      const idx = Math.min(trace.length - 1, Math.floor(simT / (trace[1] ? trace[1].t : 0.01)));
      const p = trace[idx];
      state.hopperM = p.x;
      state.hopperY = p.y;
      drawHopperSprite(ctx, mx(p.x), GROUND_Y - p.y * PX_PER_M, 0);
      // flames only during the launch impulse — never while coasting
      if ((now - a.start) / 1000 < 0.12 / state.speed) {
        drawThruster(ctx, mx(p.x), GROUND_Y - p.y * PX_PER_M - 6);
      }
      if (idx >= trace.length - 1) finishAnim(a);
    } else {
      // idle Hopper, gentle bounce (skipped under reduced motion)
      state.idleT += dt;
      const bounce = state.reducedMotion ? 0 : Math.abs(Math.sin(state.idleT * 2.2)) * 3;
      drawHopperSprite(ctx, mx(state.hopperM), GROUND_Y, bounce);
    }

    drawParticles(ctx, dt);

    if (state.montageText) {
      ctx.fillStyle = 'rgba(10,14,35,0.75)';
      ctx.fillRect(230, 20, 180, 34);
      ctx.strokeStyle = '#54e0ff';
      ctx.strokeRect(230, 20, 180, 34);
      ctx.fillStyle = '#cfe3ff';
      ctx.font = '16px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.montageText, 320, 42);
    }
  }

  // Complete a jump animation exactly once: land Hopper, burst, fire onDone.
  function finishAnim(a) {
    if (state.anim !== a) return; // already finished
    if (a.failsafe) clearTimeout(a.failsafe);
    state.anim = null;
    state.hopperM = a.result.distance;
    state.hopperY = 0;
    burst(a.result.distance, '#54e0ff');
    if (a.onDone) a.onDone();
  }

  /* Play one jump. opts: { montage, onDone } */
  function animateJump(result, opts) {
    const o = opts || {};
    state.hopperM = 0;
    if (state.reducedMotion) {
      // no animation: land instantly, still show the landing burst location
      state.hopperM = result.distance;
      state.hopperY = 0;
      if (o.onDone) o.onDone();
      return;
    }
    state.speed = o.montage ? 6 : 1;
    // fast-forward guarantee: nothing plays longer than 3 s real time
    const duration = Math.min(result.airtime, 3);
    const anim = { result, start: null, duration, onDone: o.onDone };
    // wall-clock failsafe: even if the browser starves requestAnimationFrame
    // (hidden or throttled tabs), the run still completes on time
    anim.failsafe = setTimeout(() => finishAnim(anim), (duration / state.speed) * 1000 + 120);
    state.anim = anim;
  }

  function setFast() { state.speed = Math.max(state.speed, 4); }
  function setMontageText(text) { state.montageText = text; }
  function setPrediction(m, tol, committed) {
    state.prediction = m == null ? null : { m, tol, committed: !!committed };
  }
  function setPrevGhost(m) { state.prevGhostM = m; }
  function landingScreenX(m) { return mx(m); }
  function reset() {
    if (state.anim && state.anim.failsafe) clearTimeout(state.anim.failsafe);
    state.anim = null;
    state.particles = [];
    state.prediction = null;
    state.prevGhostM = null;
    state.montageText = null;
    state.hopperM = 0;
    state.hopperY = 0;
  }
  function celebrate(m) { burst(m, '#ffcc4a', 30); }

  window.SHL = window.SHL || {};
  window.SHL.world = {
    PX_PER_M, WORLD_WIDTH_M, ORIGIN_X, GROUND_Y,
    init, setSeed, setReducedMotion, animateJump, setFast, setMontageText,
    setPrediction, setPrevGhost, landingScreenX, reset, celebrate,
  };
})();
