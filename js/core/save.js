/* Star Hopper Lab — save data (pure serialize/deserialize + browser adapter).
 * All saves are local. Corrupt or future-versioned saves degrade gracefully
 * to defaults instead of crashing the lab.
 * Runs in browser (window.SHL.save) and Node (module.exports).
 */
(function () {
  'use strict';

  const SAVE_VERSION = 1;
  const STORAGE_KEY = 'star-hopper-lab-save';

  function defaultState() {
    return {
      version: SAVE_VERSION,
      player: { name: 'Junior Scientist' },
      settings: { muted: false, reducedMotion: false },
      seed: 20260720,          // per-save universe seed; sandbox mode exposes it
      sol: 1,                  // in-game day, bumped on each published paper
      unlockedWorlds: ['terra'],
      missions: {},            // missionId -> { complete, trials: [...], targetEngine, ... }
      bests: {},               // missionId -> smallest prediction error (m)
      articles: [],            // published Hopper Journal papers
      ruleCards: [],           // collected laws of the universe
      badges: [],              // science-virtue badges
    };
  }

  // Shallow-merge loaded data onto defaults so old saves gain new fields
  // and unknown future fields survive a round-trip. Known fields must keep
  // the default's shape (object/array/primitive) — a mistyped value from a
  // hand-edited or corrupted save falls back to the default instead of
  // crashing the game later.
  function mergeOntoDefaults(loaded) {
    const state = defaultState();
    for (const key in loaded) {
      const val = loaded[key];
      const def = state[key];
      if (def !== undefined) {
        const defIsArray = Array.isArray(def);
        const defIsObject = !defIsArray && def !== null && typeof def === 'object';
        if (defIsObject) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            state[key] = Object.assign({}, def, val);
          }
          continue;
        }
        if (defIsArray) {
          if (Array.isArray(val)) state[key] = val;
          continue;
        }
        if (typeof val === typeof def) state[key] = val;
        continue;
      }
      if (val !== undefined) state[key] = val; // unknown future field: keep
    }
    state.version = SAVE_VERSION;
    return state;
  }

  function serialize(state) {
    return JSON.stringify(Object.assign({}, state, { version: SAVE_VERSION }));
  }

  function deserialize(text) {
    if (typeof text !== 'string' || !text) {
      return { ok: false, state: defaultState(), error: 'empty' };
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, state: defaultState(), error: 'corrupt' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, state: defaultState(), error: 'not-an-object' };
    }
    return { ok: true, state: mergeOntoDefaults(parsed) };
  }

  // Browser adapter (no-ops safely if localStorage is unavailable).
  function load() {
    try {
      return deserialize(window.localStorage.getItem(STORAGE_KEY)).state;
    } catch (e) {
      return defaultState();
    }
  }
  function store(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, serialize(state));
      return true;
    } catch (e) {
      return false; // quota/private mode: play on without persistence
    }
  }
  function wipe() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* fine */ }
  }

  const api = { SAVE_VERSION, STORAGE_KEY, defaultState, serialize, deserialize, mergeOntoDefaults, load, store, wipe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.save = api; }
})();
