const BASE = `http://localhost:${process.env.PORT || 3000}/api`;

async function main() {
  const email = `locktest_${Date.now()}@example.com`;
  const signup = await fetch(`${BASE}/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  }).then(r => r.json());
  const token = signup.token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const cats = await fetch(`${BASE}/categories`, { headers }).then(r => r.json());
  const categoryId = cats[0].id;

  await fetch(`${BASE}/plans`, { method: 'POST', headers, body: JSON.stringify({ category_id: categoryId, month: '2026-05', amount: 1000 }) });
  await fetch(`${BASE}/locks`, { method: 'POST', headers, body: JSON.stringify({ month: '2026-05' }) });

  const planRes = await fetch(`${BASE}/plans`, { method: 'POST', headers, body: JSON.stringify({ category_id: categoryId, month: '2026-05', amount: 2000 }) });
  const actualRes = await fetch(`${BASE}/actuals`, { method: 'POST', headers, body: JSON.stringify({ category_id: categoryId, month: '2026-05', amount: 500 }) });

  console.assert(planRes.status === 423, `Expected 423 for locked plan edit, got ${planRes.status}`);
  console.assert(actualRes.status === 423, `Expected 423 for locked actual create, got ${actualRes.status}`);

  const unlockedRes = await fetch(`${BASE}/plans`, { method: 'POST', headers, body: JSON.stringify({ category_id: categoryId, month: '2026-06', amount: 2000 }) });
  console.assert(unlockedRes.status === 200, `Expected 200 for unlocked month, got ${unlockedRes.status}`);

  if (planRes.status === 423 && actualRes.status === 423 && unlockedRes.status === 200) {
    console.log('ok - lock enforcement passed');
  } else {
    console.error('FAIL - lock enforcement');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
