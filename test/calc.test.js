const assert = require('assert');
const { calcVariance, isValidMonth, monthsInRange } = require('../server/helpers');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    console.error(e.message);
    process.exitCode = 1;
  }
}

console.log('calcVariance');
test('normal case: under plan', () => {
  const r = calcVariance(5000, 4800);
  assert.strictEqual(r.variance, -200);
  assert.strictEqual(r.variancePct, -4);
});
test('normal case: over plan', () => {
  const r = calcVariance(20000, 20500);
  assert.strictEqual(r.variance, 500);
  assert.strictEqual(r.variancePct, 2.5);
});
test('missing actual treated as 0', () => {
  const r = calcVariance(5000, 0);
  assert.strictEqual(r.variance, -5000);
  assert.strictEqual(r.variancePct, -100);
});
test('plan is zero does not throw or produce NaN/Infinity', () => {
  const r = calcVariance(0, 300);
  assert.strictEqual(r.variance, 300);
  assert.strictEqual(r.variancePct, null);
  assert.ok(!Number.isNaN(r.variance));
});
test('plan is zero and actual is zero', () => {
  const r = calcVariance(0, 0);
  assert.strictEqual(r.variance, 0);
  assert.strictEqual(r.variancePct, null);
});

console.log('isValidMonth');
test('accepts valid YYYY-MM', () => {
  assert.strictEqual(isValidMonth('2026-01'), true);
  assert.strictEqual(isValidMonth('2026-12'), true);
});
test('rejects invalid formats', () => {
  assert.strictEqual(isValidMonth('2026-13'), false);
  assert.strictEqual(isValidMonth('2026-00'), false);
  assert.strictEqual(isValidMonth('26-01'), false);
  assert.strictEqual(isValidMonth('2026/01'), false);
  assert.strictEqual(isValidMonth(''), false);
  assert.strictEqual(isValidMonth(null), false);
});

console.log('monthsInRange');
test('same-year range', () => {
  assert.deepStrictEqual(monthsInRange('2026-01', '2026-03'), ['2026-01', '2026-02', '2026-03']);
});
test('cross-year range', () => {
  assert.deepStrictEqual(monthsInRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
test('single month range', () => {
  assert.deepStrictEqual(monthsInRange('2026-01', '2026-01'), ['2026-01']);
});

console.log('\nDone.');
