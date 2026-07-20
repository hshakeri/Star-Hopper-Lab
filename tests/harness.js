/* Minimal test harness: no dependencies, plain asserts, clear output. */
'use strict';

const cases = [];

function test(name, fn) { cases.push({ name, fn }); }

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected condition to be true');
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'values differ'}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg || 'values not close'}\n  expected: ${expected} ± ${tol}\n  actual:   ${actual}`);
  }
}
function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg || 'objects differ'}\n  expected: ${b}\n  actual:   ${a}`);
  }
}
function includes(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) < 0) {
    throw new Error(`${msg || 'string missing expected part'}\n  looking for: ${needle}\n  in:          ${haystack}`);
  }
}

function runAll() {
  let passed = 0;
  const failures = [];
  for (const c of cases) {
    try {
      c.fn();
      passed++;
    } catch (e) {
      failures.push({ name: c.name, error: e });
    }
  }
  for (const f of failures) {
    console.error(`\n✗ ${f.name}\n  ${f.error.message.split('\n').join('\n  ')}`);
  }
  console.log(`\n${passed}/${cases.length} tests passed`);
  if (failures.length) {
    console.error(`${failures.length} FAILED`);
    process.exit(1);
  }
}

module.exports = { test, ok, eq, near, deepEq, includes, runAll };
