'use strict';
const { test, ok, eq, near, includes } = require('./harness.js');
const kidcode = require('../js/core/kidcode.js');

// A little laboratory host for the interpreter to talk to.
function makeHost() {
  const state = {
    jumps: [],
    recorded: [],
    jumpCount: 0,
    vars: { 'hopper.engine': 3, 'jump.distance': 0 },
  };
  const data = kidcode.makeDataCommands({ record: (v) => state.recorded.push(v) });
  const host = {
    commands: Object.assign({
      jump() {
        state.jumpCount++;
        const d = 1.5 + 4 * state.vars['hopper.engine'];
        state.vars['jump.distance'] = d;
        state.jumps.push(d);
        return d;
      },
      friend() { state.friended = (state.friended || 0) + 1; },
      zap() { state.zapped = (state.zapped || 0) + 1; },
    }, data),
    getVar(name) {
      if (name === 'jumps') return state.jumps.slice();
      return state.vars[name];
    },
    hasVar(name) { return name in state.vars; },
    setVar(name, v) { state.vars[name] = v; },
    varNames() { return Object.keys(state.vars).concat(['jumps']); },
  };
  return { host, state };
}

test('kidcode: assignment and host variables', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('hopper.engine = 7\njump()', host);
  ok(r.ok, r.error);
  eq(state.vars['hopper.engine'], 7);
  eq(state.jumps[0], 1.5 + 28);
});

test('kidcode: plain variables live in the program', () => {
  const { host } = makeHost();
  const r = kidcode.run('power = 4\ndouble = power * 2\ndouble', host);
  ok(r.ok, r.error);
  eq(r.value, 8);
});

test('kidcode: repeat with same-line body', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 10: jump()', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 10);
});

test('kidcode: repeat with indented block', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 3:\n  jump()\n  record(jump.distance)', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 3);
  eq(state.recorded.length, 3);
});

test('kidcode: a statement AFTER an indented block parses (the Jump Squad shape)', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('hopper.engine = 5\nrepeat 5:\n  jump()\naverage(jumps)', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 5);
  eq(r.value, 21.5);
});

test('kidcode: a statement after a nested block inside a block parses', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 2:\n  repeat 2:\n    jump()\n  jump()\njump()', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 7);
});

test('kidcode: a when-block followed by another statement parses', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('when critter.spots > 5:\n  friend()\njump()', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 1);
  eq(r.whenRules.length, 1);
});

test('kidcode: nested repeats work', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 3:\n  repeat 2:\n    jump()', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 6);
});

// SAFETY CAPS
test('safety: repeat above the cap is stopped with a friendly message', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 1000000: jump()', host);
  eq(r.ok, false);
  includes(r.error, 'safety cap');
  includes(r.error, '100');
  eq(state.jumpCount, 0, 'no work should happen before the cap check');
});

test('safety: nested loops within the cap still hit the total-work budget', () => {
  const { host } = makeHost();
  const r = kidcode.run('repeat 100:\n  repeat 100:\n    x = 1', host);
  eq(r.ok, false);
  includes(r.error, 'safety');
});

test('safety: caps are configurable for sandbox mode', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('repeat 150: jump()', host, { maxLoopIter: 200, maxOps: 5000 });
  ok(r.ok, r.error);
  eq(state.jumpCount, 150);
});

// FRIENDLY ERRORS
test('errors: unknown command gets the exact did-you-mean message', () => {
  const { host } = makeHost();
  const r = kidcode.run('avrage(jumps)', host);
  eq(r.ok, false);
  includes(r.error, `I don't know the command: 'avrage()'. Did you mean average()?`);
});

test('errors: unknown command with no close match lists known commands', () => {
  const { host } = makeHost();
  const r = kidcode.run('flabbergast()', host);
  eq(r.ok, false);
  includes(r.error, `I don't know the command: 'flabbergast()'.`);
  includes(r.error, 'Commands I know:');
});

test('errors: average of an empty list gives the data-aware hint', () => {
  const { host } = makeHost();
  const r = kidcode.run('average(jumps)', host);
  eq(r.ok, false);
  includes(r.error, 'average() needs at least one number — record a jump first!');
});

test('errors: unknown variable suggests a close name', () => {
  const { host } = makeHost();
  const r = kidcode.run('hopper.engin = 5', host);
  ok(r.ok, 'assigning a new name is fine');
  const r2 = kidcode.run('x = jmups', host);
  eq(r2.ok, false);
  includes(r2.error, `I don't know the name 'jmups'`);
  includes(r2.error, 'jumps');
});

test('errors: errors carry the right line number', () => {
  const { host } = makeHost();
  const r = kidcode.run('jump()\njump()\nbroken()', host);
  eq(r.ok, false);
  eq(r.errorLine, 3);
});

test('errors: division by zero is friendly', () => {
  const { host } = makeHost();
  const r = kidcode.run('x = 5 / 0', host);
  eq(r.ok, false);
  includes(r.error, 'zero');
});

test('errors: quotes are rejected gently', () => {
  const { host } = makeHost();
  const r = kidcode.run('name = "hopper"', host);
  eq(r.ok, false);
  includes(r.error, 'quotes');
});

test('errors: two instructions on one line are caught', () => {
  const { host } = makeHost();
  const r = kidcode.run('jump() jump()', host);
  eq(r.ok, false);
  includes(r.error, 'one instruction per line');
});

test('errors: bad indentation is explained', () => {
  const { host } = makeHost();
  const r = kidcode.run('repeat 2:\n    jump()\n  jump()', host);
  eq(r.ok, false);
  includes(r.error, 'line up');
});

test('errors: repeat without colon shows an example', () => {
  const { host } = makeHost();
  const r = kidcode.run('repeat 5\n  jump()', host);
  eq(r.ok, false);
  includes(r.error, 'repeat 5: jump()');
});

test('errors: adding a list to a number hints at average()', () => {
  const { host } = makeHost();
  kidcode.run('jump()', host);
  const r = kidcode.run('x = jumps + 1', host);
  eq(r.ok, false);
  includes(r.error, 'average(');
});

// DATA CALLS
test('data: count/average/biggest work on the jumps list', () => {
  const { host } = makeHost();
  const r = kidcode.run('hopper.engine = 2\njump()\nhopper.engine = 4\njump()\nc = count(jumps)\na = average(jumps)\nb = biggest(jumps)\nb', host);
  ok(r.ok, r.error);
  eq(r.value, 17.5);
  const r2 = kidcode.run('count(jumps)', host);
  ok(r2.ok, r2.error);
  eq(r2.value, 2);
});

test('data: expression statements print their value to the console output', () => {
  const { host } = makeHost();
  kidcode.run('jump()\njump()', host);
  const r = kidcode.run('average(jumps)', host);
  ok(r.ok, r.error);
  eq(r.output.length, 1);
  includes(r.output[0], 'average(jumps) →');
});

test('data: record() writes numbers down and rejects non-numbers', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('jump()\nrecord(jump.distance)', host);
  ok(r.ok, r.error);
  eq(state.recorded.length, 1);
  const r2 = kidcode.run('record(jumps)', host);
  eq(r2.ok, false);
  includes(r2.error, 'record() needs a number');
});

// TINY MODELS
test('models: predict(power) = start + slope * power', () => {
  const { host } = makeHost();
  const r = kidcode.run('start = 2\nslope = 4\npredict(power) = start + slope * power\nguess = predict(5)\nguess', host);
  ok(r.ok, r.error);
  eq(r.value, 22);
});

test('models: late binding — tuning slope after defining updates predictions', () => {
  const { host } = makeHost();
  const r = kidcode.run('start = 0\nslope = 1\npredict(p) = start + slope * p\nslope = 10\npredict(3)', host);
  ok(r.ok, r.error);
  eq(r.value, 30);
});

test('models: wrong number of arguments is explained', () => {
  const { host } = makeHost();
  const r = kidcode.run('predict(p) = p * 2\npredict(1, 2)', host);
  eq(r.ok, false);
  includes(r.error, 'exactly one number');
});

// WHEN RULES (the Sorter Station engine, tested early)
test('when: rules fire only when their condition is true', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('when critter.spots > 5: friend()\nwhen critter.spots <= 5: zap()', host);
  ok(r.ok, r.error);
  eq(r.whenRules.length, 2);
  kidcode.runWhenRules(r, 'critter', { spots: 8 });
  eq(state.friended, 1);
  eq(state.zapped || 0, 0);
  kidcode.runWhenRules(r, 'critter', { spots: 2 });
  eq(state.friended, 1);
  eq(state.zapped, 1);
});

test('when: rule bodies can use program variables', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('limit = 4\nwhen critter.spots > limit: friend()', host);
  ok(r.ok, r.error);
  kidcode.runWhenRules(r, 'critter', { spots: 5 });
  eq(state.friended, 1);
});

// EXPRESSIONS
test('expr: precedence, parens, unary minus, comparisons', () => {
  const { host } = makeHost();
  eq(kidcode.run('2 + 3 * 4', host).value, 14);
  eq(kidcode.run('(2 + 3) * 4', host).value, 20);
  eq(kidcode.run('-3 + 10', host).value, 7);
  eq(kidcode.run('7 > 5', host).value, true);
  eq(kidcode.run('7 <= 5', host).value, false);
  eq(kidcode.run('3 == 3', host).value, true);
  eq(kidcode.run('3 != 3', host).value, false);
});

test('expr: comments and blank lines are ignored', () => {
  const { host, state } = makeHost();
  const r = kidcode.run('# warm up the engine\n\nhopper.engine = 5  # five is nice\njump()\n', host);
  ok(r.ok, r.error);
  eq(state.jumpCount, 1);
});

test('kidcode: empty program is fine and does nothing', () => {
  const { host } = makeHost();
  const r = kidcode.run('', host);
  ok(r.ok, r.error);
  eq(r.output.length, 0);
});

test('levenshtein sanity', () => {
  eq(kidcode.levenshtein('avrage', 'average'), 1);
  eq(kidcode.levenshtein('same', 'same'), 0);
  eq(kidcode.suggest('avrage', ['average', 'count']), 'average');
  eq(kidcode.suggest('zzz', ['average', 'count']), null);
});
