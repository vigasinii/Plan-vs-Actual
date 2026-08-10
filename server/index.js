const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { signToken, requireAuth } = require('./auth');
const { isValidMonth, calcVariance, monthsInRange } = require('./helpers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: 'text/csv', limit: '2mb' }));

app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password (min 6 chars) are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
  const user = { id: info.lastInsertRowid, email };

  const seed = ['Marketing', 'Payroll', 'Tools'];
  const insertCat = db.prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)');
  seed.forEach(name => insertCat.run(user.id, name));

  res.json({ token: signToken(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

function isLocked(userId, month) {
  return !!db.prepare('SELECT 1 FROM locks WHERE user_id = ? AND month = ?').get(userId, month);
}

app.get('/api/categories', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, name FROM categories WHERE user_id = ? ORDER BY name').all(req.user.id);
  res.json(rows);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
  try {
    const info = db.prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)').run(req.user.id, name.trim());
    res.json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(409).json({ error: 'Category already exists' });
  }
});

function findOrCreateCategory(userId, name) {
  const existing = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?').get(userId, name);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)').run(userId, name);
  return info.lastInsertRowid;
}

app.get('/api/plans', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.month, p.amount, c.id as category_id, c.name as category_name
    FROM plans p JOIN categories c ON c.id = p.category_id
    WHERE p.user_id = ? ORDER BY p.month, c.name
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/plans', requireAuth, (req, res) => {
  const { category_id, month, amount } = req.body || {};
  if (!category_id || !isValidMonth(month) || typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ error: 'category_id, valid month (YYYY-MM), and non-negative amount are required' });
  }
  if (isLocked(req.user.id, month)) {
    return res.status(423).json({ error: `Month ${month} is locked and cannot be edited` });
  }
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(category_id, req.user.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  db.prepare(`
    INSERT INTO plans (user_id, category_id, month, amount) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, category_id, month) DO UPDATE SET amount = excluded.amount
  `).run(req.user.id, category_id, month, amount);

  res.json({ ok: true });
});

app.put('/api/plans/:id', requireAuth, (req, res) => {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  if (isLocked(req.user.id, plan.month)) {
    return res.status(423).json({ error: `Month ${plan.month} is locked and cannot be edited` });
  }
  const { amount } = req.body || {};
  if (typeof amount !== 'number' || amount < 0) return res.status(400).json({ error: 'Valid amount required' });
  db.prepare('UPDATE plans SET amount = ? WHERE id = ?').run(amount, plan.id);
  res.json({ ok: true });
});

app.get('/api/actuals', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.month, a.amount, a.note, c.id as category_id, c.name as category_name
    FROM actuals a JOIN categories c ON c.id = a.category_id
    WHERE a.user_id = ? ORDER BY a.month, c.name
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/actuals', requireAuth, (req, res) => {
  const { category_id, month, amount, note } = req.body || {};
  if (!category_id || !isValidMonth(month) || typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ error: 'category_id, valid month (YYYY-MM), and non-negative amount are required' });
  }
  if (isLocked(req.user.id, month)) {
    return res.status(423).json({ error: `Month ${month} is locked and cannot be edited` });
  }
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(category_id, req.user.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const info = db.prepare(
    'INSERT INTO actuals (user_id, category_id, month, amount, note) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, category_id, month, amount, note || null);

  res.json({ id: info.lastInsertRowid, ok: true });
});

app.delete('/api/actuals/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM actuals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Actual not found' });
  if (isLocked(req.user.id, row.month)) {
    return res.status(423).json({ error: `Month ${row.month} is locked and cannot be edited` });
  }
  db.prepare('DELETE FROM actuals WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

app.post('/api/actuals/import', requireAuth, (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv);
  if (!csv || !csv.trim()) return res.status(400).json({ error: 'CSV body is required' });

  const lines = csv.trim().split(/\r?\n/);
  let start = 0;
  if (lines[0] && lines[0].toLowerCase().replace(/\s/g, '').startsWith('month,category,amount')) start = 1;

  const errors = [];
  const validRows = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 3) {
      errors.push({ line: i + 1, error: 'Expected 3 columns: month,category,amount', raw: line });
      continue;
    }
    const [month, category, amountStr] = [parts[0].trim(), parts[1].trim(), parts[2].trim()];
    const amount = Number(amountStr);

    if (!isValidMonth(month)) {
      errors.push({ line: i + 1, error: `Invalid month format: "${month}" (expected YYYY-MM)`, raw: line });
      continue;
    }
    if (!category) {
      errors.push({ line: i + 1, error: 'Category name is required', raw: line });
      continue;
    }
    if (Number.isNaN(amount) || amount < 0) {
      errors.push({ line: i + 1, error: `Invalid amount: "${amountStr}"`, raw: line });
      continue;
    }
    if (isLocked(req.user.id, month)) {
      errors.push({ line: i + 1, error: `Month ${month} is locked`, raw: line });
      continue;
    }
    validRows.push({ month, category, amount });
  }

  const insert = db.prepare('INSERT INTO actuals (user_id, category_id, month, amount, note) VALUES (?, ?, ?, ?, ?)');
  let imported = 0;
  db.exec('BEGIN');
  try {
    for (const row of validRows) {
      const categoryId = findOrCreateCategory(req.user.id, row.category);
      insert.run(req.user.id, categoryId, row.month, row.amount, 'Imported via CSV');
      imported++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Import failed', detail: e.message });
  }

  res.json({ imported, failed: errors.length, errors });
});

app.get('/api/locks', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT month FROM locks WHERE user_id = ? ORDER BY month').all(req.user.id);
  res.json(rows.map(r => r.month));
});

app.post('/api/locks', requireAuth, (req, res) => {
  const { month } = req.body || {};
  if (!isValidMonth(month)) return res.status(400).json({ error: 'Valid month (YYYY-MM) is required' });
  db.prepare('INSERT OR IGNORE INTO locks (user_id, month) VALUES (?, ?)').run(req.user.id, month);
  res.json({ ok: true, month });
});

app.delete('/api/locks/:month', requireAuth, (req, res) => {
  if (!isValidMonth(req.params.month)) return res.status(400).json({ error: 'Valid month (YYYY-MM) is required' });
  db.prepare('DELETE FROM locks WHERE user_id = ? AND month = ?').run(req.user.id, req.params.month);
  res.json({ ok: true });
});

app.get('/api/report', requireAuth, (req, res) => {
  const { start, end } = req.query;
  if (!isValidMonth(start) || !isValidMonth(end)) {
    return res.status(400).json({ error: 'start and end query params (YYYY-MM) are required' });
  }
  const months = monthsInRange(start, end);
  if (months.length === 0 || months.length > 60) {
    return res.status(400).json({ error: 'Invalid or excessively large date range' });
  }

  const categories = db.prepare('SELECT id, name FROM categories WHERE user_id = ? ORDER BY name').all(req.user.id);
  const planRows = db.prepare(`SELECT category_id, month, amount FROM plans WHERE user_id = ? AND month BETWEEN ? AND ?`)
    .all(req.user.id, start, end);
  const actualRows = db.prepare(`SELECT category_id, month, SUM(amount) as amount FROM actuals WHERE user_id = ? AND month BETWEEN ? AND ? GROUP BY category_id, month`)
    .all(req.user.id, start, end);
  const lockedMonths = new Set(db.prepare('SELECT month FROM locks WHERE user_id = ?').all(req.user.id).map(r => r.month));

  const planMap = new Map(planRows.map(r => [`${r.category_id}|${r.month}`, r.amount]));
  const actualMap = new Map(actualRows.map(r => [`${r.category_id}|${r.month}`, r.amount]));

  const rows = [];
  for (const cat of categories) {
    for (const month of months) {
      const key = `${cat.id}|${month}`;
      const hasPlan = planMap.has(key);
      const hasActual = actualMap.has(key);
      if (!hasPlan && !hasActual) continue;

      const plan = hasPlan ? planMap.get(key) : 0;
      const actual = hasActual ? actualMap.get(key) : 0;
      const { variance, variancePct } = calcVariance(plan, actual);

      rows.push({
        category_id: cat.id,
        category_name: cat.name,
        month,
        plan: hasPlan ? plan : null,
        actual: hasActual ? actual : null,
        actual_missing: !hasActual,
        variance,
        variance_pct: variancePct,
        locked: lockedMonths.has(month),
      });
    }
  }

  const monthlyNet = months.map(month => {
    const monthRows = rows.filter(r => r.month === month);
    const totalPlan = monthRows.reduce((s, r) => s + (r.plan || 0), 0);
    const totalActual = monthRows.reduce((s, r) => s + (r.actual || 0), 0);
    return { month, plan: totalPlan, actual: totalActual, variance: totalActual - totalPlan };
  });

  res.json({ months, rows, chart: monthlyNet, locked_months: [...lockedMonths] });
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Plan vs Actual Tracker running on http://localhost:${PORT}`));
