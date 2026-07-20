'use strict';
const { test, ok, eq, deepEq, includes } = require('./harness.js');
const save = require('../js/core/save.js');

test('save: round-trip preserves everything', () => {
  const state = save.defaultState();
  state.player.name = 'Ada';
  state.missions['terra-1'] = { complete: true, trials: [{ engine: 3, distance: 13.5 }] };
  state.bests['terra-1'] = 0.4;
  state.articles.push({ title: 'Jump Science!', sol: 1, sentence: 'Each +1 engine adds about 4 m.' });
  state.ruleCards.push({ id: 'engine-law', text: 'Each +1 engine adds about 4 m.' });
  const back = save.deserialize(save.serialize(state));
  eq(back.ok, true);
  deepEq(back.state, state);
});

test('save: corrupt JSON falls back to defaults without crashing', () => {
  const r = save.deserialize('{oops, this is not json');
  eq(r.ok, false);
  eq(r.error, 'corrupt');
  deepEq(r.state, save.defaultState());
});

test('save: empty and wrong-shaped input fall back to defaults', () => {
  eq(save.deserialize('').ok, false);
  eq(save.deserialize(null).ok, false);
  eq(save.deserialize('[1,2,3]').ok, false);
  deepEq(save.deserialize('"hi"').ok, false);
});

test('save: old saves gain new default fields on load', () => {
  const old = JSON.stringify({ version: 0, player: { name: 'Rex' } });
  const r = save.deserialize(old);
  eq(r.ok, true);
  eq(r.state.player.name, 'Rex');
  ok(Array.isArray(r.state.ruleCards), 'missing fields must be filled from defaults');
  eq(r.state.version, save.SAVE_VERSION);
});

test('save: unknown future fields survive a round-trip', () => {
  const future = JSON.stringify(Object.assign(save.defaultState(), { wormholes: [1, 2] }));
  const r = save.deserialize(future);
  eq(r.ok, true);
  deepEq(r.state.wormholes, [1, 2]);
  const again = save.deserialize(save.serialize(r.state));
  deepEq(again.state.wormholes, [1, 2]);
});
