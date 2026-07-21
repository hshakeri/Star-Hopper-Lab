/* Star Hopper Lab — procedural Web Audio chiptunes.
 * No audio files: every sound is synthesized. Fails silently on browsers
 * without Web Audio. Respects the mute setting everywhere.
 */
(function () {
  'use strict';

  const state = { ctx: null, muted: false, ready: false };

  function ensure() {
    if (state.muted) return null;
    try {
      if (!state.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        state.ctx = new AC();
      }
      if (state.ctx.state === 'suspended') state.ctx.resume();
      return state.ctx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, dur, opts) {
    const ctx = ensure();
    if (!ctx) return;
    const o = opts || {};
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'square';
      const t0 = ctx.currentTime + (o.delay || 0);
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
      const g = o.gain || 0.06;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(g, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* sound is a garnish, never a crash */ }
  }

  const api = {
    init(muted) { state.muted = !!muted; },
    setMuted(m) { state.muted = !!m; if (!m) ensure(); },
    isMuted() { return state.muted; },
    unlock() { ensure(); },                    // call on first user gesture

    uiClick() { tone(520, 0.05, { type: 'triangle', gain: 0.04 }); },
    jump() { tone(330, 0.18, { slideTo: 880, type: 'square', gain: 0.05 }); },
    land() { tone(140, 0.12, { slideTo: 70, type: 'square', gain: 0.07 }); },
    montageTick(i) { tone(440 + 40 * (i % 8), 0.05, { type: 'square', gain: 0.04 }); },
    error() { tone(220, 0.2, { slideTo: 180, type: 'sawtooth', gain: 0.03 }); },
    lock() { tone(392, 0.08, { type: 'triangle' }); tone(523, 0.1, { type: 'triangle', delay: 0.09 }); },
    stars(n) {
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < Math.min(n + 1, 4); i++) {
        tone(notes[i], 0.12, { type: 'square', gain: 0.05, delay: i * 0.09 });
      }
    },
    // the "pattern snap" stinger: a warm major chord
    snap() {
      tone(262, 0.5, { type: 'triangle', gain: 0.05 });
      tone(330, 0.5, { type: 'triangle', gain: 0.05, delay: 0.02 });
      tone(392, 0.5, { type: 'triangle', gain: 0.05, delay: 0.04 });
      tone(523, 0.35, { type: 'triangle', gain: 0.04, delay: 0.12 });
    },
    publish() {
      const seq = [392, 392, 523, 659];
      seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.3 : 0.1, { type: 'square', gain: 0.05, delay: i * 0.11 }));
    },
    quack() { tone(190, 0.09, { slideTo: 150, type: 'sawtooth', gain: 0.05 }); tone(190, 0.09, { slideTo: 150, type: 'sawtooth', gain: 0.05, delay: 0.12 }); },
  };

  window.SHL = window.SHL || {};
  window.SHL.audio = api;
})();
