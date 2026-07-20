'use strict';
const { test, ok, eq, near } = require('./harness.js');
const { makeRNG, hashString } = require('../js/core/rng.js');

test('rng: same seed gives the identical sequence', () => {
  const a = makeRNG(12345);
  const b = makeRNG(12345);
  for (let i = 0; i < 100; i++) eq(a.next(), b.next(), `draw ${i} diverged`);
});

test('rng: different seeds give different sequences', () => {
  const a = makeRNG(1);
  const b = makeRNG(2);
  let same = 0;
  for (let i = 0; i < 50; i++) if (a.next() === b.next()) same++;
  ok(same < 5, 'seeds 1 and 2 look identical');
});

test('rng: string seeds hash deterministically', () => {
  eq(hashString('ventus-storm-7'), hashString('ventus-storm-7'));
  ok(hashString('a') !== hashString('b'), 'different strings should hash differently');
});

test('rng: fork gives an independent, reproducible stream', () => {
  const a = makeRNG(99).fork('jokes');
  const b = makeRNG(99).fork('jokes');
  const c = makeRNG(99).fork('physics');
  eq(a.next(), b.next(), 'same fork label must reproduce');
  ok(makeRNG(99).fork('jokes').next() !== c.next(), 'different fork labels should differ');
});

test('rng: int(min,max) stays inclusive and in range', () => {
  const r = makeRNG(7);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(1, 6);
    ok(v >= 1 && v <= 6 && Number.isInteger(v), `int out of range: ${v}`);
    seen.add(v);
  }
  eq(seen.size, 6, 'all faces of the die should appear');
});

test('rng: shuffle is a permutation and deterministic per seed', () => {
  const r = makeRNG(42);
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = r.shuffle(src);
  eq(out.length, src.length);
  eq(out.slice().sort((a, b) => a - b).join(','), src.join(','), 'shuffle lost or duplicated items');
  eq(src.join(','), '1,2,3,4,5,6,7,8', 'shuffle must not mutate its input');
  eq(makeRNG(42).shuffle(src).join(','), out.join(','), 'same seed must shuffle identically');
});

// STATISTICAL HONESTY: the game's only noise source must be unbiased.
test('honesty: noise mean ≈ 0 over 10k draws and stays inside ±amp', () => {
  const r = makeRNG(2026);
  const amp = 3;
  let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const v = r.noise(amp);
    ok(v >= -amp && v <= amp, `noise escaped its bounds: ${v}`);
    sum += v;
  }
  near(sum / 10000, 0, amp * 0.02, 'noise is biased');
});

test('honesty: noise is unbiased across many different seeds', () => {
  let grand = 0;
  for (let s = 0; s < 200; s++) {
    const r = makeRNG(s * 1000 + 17);
    for (let i = 0; i < 50; i++) grand += r.noise(1);
  }
  near(grand / (200 * 50), 0, 0.02, 'noise biased across seeds');
});
