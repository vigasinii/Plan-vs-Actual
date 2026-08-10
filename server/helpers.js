const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidMonth(m) {
  return typeof m === 'string' && MONTH_RE.test(m);
}

function calcVariance(plan, actual) {
  const p = plan || 0;
  const a = actual;
  const variance = a - p;
  let variancePct = null;
  if (p !== 0) {
    variancePct = (variance / p) * 100;
  }
  return { variance, variancePct };
}

function monthsInRange(start, end) {
  const months = [];
  let [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (sy < ey || (sy === ey && sm <= em)) {
    months.push(`${sy}-${String(sm).padStart(2, '0')}`);
    sm++;
    if (sm > 12) { sm = 1; sy++; }
  }
  return months;
}

module.exports = { isValidMonth, calcVariance, monthsInRange };
