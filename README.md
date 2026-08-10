# Ledger, Plan vs Actual Tracker

A small full-stack app for setting monthly spend targets per category, logging
actuals, and reviewing plan-vs-actual variance with support for locked periods.

**Stack:** Node.js + Express + SQLite (built-in `node:sqlite` module, no
native compilation required), JWT auth, vanilla
JS/HTML frontend (no build step), Chart.js for the variance chart.

**Live URL:** _add your deployed URL here after deploying (see Deployment below)._

---

## Prerequisites

- Node.js 22.5+ (uses the built-in `node:sqlite` module, no separate database
  driver or native build step needed)
- npm

## Setup

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` (set `PORT` env var to change it).
A SQLite file `data.sqlite` is created automatically on first run, no
separate migration step is needed; the schema is created idempotently in
`server/db.js` on boot.

Open `http://localhost:3000` in a browser, create an account, and go.

### Running tests

```bash
npm test                       # unit tests: variance calc, month validation, range logic
node test/lock.integration.test.js   # integration test: server-side lock enforcement (server must be running)
```

---

## Deployment

The app is a single Node process serving both the API and the static
frontend, so it deploys as-is to any Node host (Render, Railway, Fly.io,
a VPS, etc.):

1. Push this repo to your host of choice.
2. Set `JWT_SECRET` to a real secret in the environment (falls back to a dev
   default otherwise, fine locally, not for production).
3. Start command: `npm start`. The SQLite file will be created in the
   container's filesystem, for a host with ephemeral disks, mount a
   persistent volume at the project root, or swap SQLite for Postgres (see
   "What I'd improve" below).

---

## Design decisions & documented edge cases

### Variance % when Plan = 0
If `plan === 0`, variance % is returned as `null` from the API and rendered
as **"N/A"** in the UI, never `NaN` or `Infinity`. The dollar variance
(`actual - plan`) is still shown normally in that case.

### Missing actuals
If a category/month combination has a plan but no logged actual, the API
returns `actual: null` and a `actual_missing: true` flag. The **UI shows
"N/A"** for the Actual column, so it's visually distinct from a real `$0`
entry. For the underlying **variance calculation**, a missing actual is
treated as `0` (i.e., "you spent nothing against this plan"), this matches
the assignment's sample data (Marketing Feb 2026 → variance −5,000 / −100%).
This is applied consistently everywhere in the report.

### Locking granularity
Locking is **by calendar month** (not quarter) since actuals and plans are
already keyed by month, this keeps the mental model 1:1 with the data and
avoids needing a separate quarter-to-month mapping. Locking a month:
- Blocks `POST /api/plans` (create/update) and `POST/DELETE /api/actuals`
  for that month, returning **HTTP 423 Locked** with a clear JSON error, enforced in the API route handlers, not just hidden in the UI.
- Does **not** retroactively block CSV imports that target a locked month;
  those rows are individually rejected and reported back in the import
  response (`errors` array) so partial imports still succeed for open
  months.

### Categories
A fixed seed list (Marketing, Payroll, Tools) is created automatically on
signup for convenience. Full CRUD isn't built for categories beyond create
(`POST /api/categories`) and implicit creation via CSV import
(`find or create by name`), documented here as intentionally out of scope,
per the assignment's allowance for a fixed seed list.

### CSV import
Format: `month,category,amount` (header row optional/auto-detected).
Each row is validated independently, invalid month format, missing
category, non-numeric/negative amount, or a locked target month are all
rejected per-row with a line number and reason, while valid rows in the same
file still import. Categories not yet in the account are created
automatically (case-sensitive exact match).

---

## Data model

```
users        (id, email, password_hash)
categories   (id, user_id, name)                         unique(user_id, name)
plans        (id, user_id, category_id, month, amount)   unique(user_id, category_id, month)
actuals      (id, user_id, category_id, month, amount, note)
locks        (id, user_id, month)                         unique(user_id, month)
```

All rows are scoped by `user_id` and every route checks the JWT-derived
user id against ownership before reading or writing, so users can only see
and modify their own data. Foreign keys cascade on delete.

## Performance / indexing notes

At current scale this is trivial, but for the query patterns this app has
(fetch all plans/actuals for a user within a month range, grouped by
category), the indexes already in place are:

- `plans(user_id, month)` and `actuals(user_id, month)`, support the report's
  range scan (`WHERE user_id = ? AND month BETWEEN ? AND ?`).
- `actuals(user_id, category_id, month)`, supports the `GROUP BY
  category_id, month` aggregation used to sum multiple actual entries per
  cell.

At real scale (many users, years of monthly data), I'd:
- Move from SQLite to Postgres and pre-aggregate actuals into a monthly
  rollup table (updated via trigger or batch job) rather than summing raw
  rows on every report request.
- Add a composite covering index on `(user_id, month, category_id)` for both
  tables so the report query can be satisfied entirely from the index.
- Paginate the "all plans" / "all actuals" list views once they grow beyond
  a page.

---

## Assumptions & tradeoffs

- Auth is intentionally minimal (email + bcrypt password + JWT, 7-day
  expiry, no refresh tokens, no email verification), enough to
  demonstrate per-user data isolation without building a full auth system.
- No category CRUD beyond create/auto-create, see "Categories" above.
- The report groups by category × month and skips category/month cells with
  no plan and no actual at all, to avoid a huge sparse grid across every
  category for every month in a wide range.
- Locking is per-user, not global, each user manages their own locked
  periods, since there's no shared org/tenant concept in this scope.
- The frontend is deliberately framework-free (vanilla JS + Chart.js) to
  keep the deliverable inspectable in one file and avoid a build step for
  review purposes.

## What I'd improve before production

- Real ownership tests / broader integration test coverage (currently one
  lock-enforcement integration test plus unit tests for the pure calc
  functions, I'd add tests per endpoint, especially permission-boundary
  cases like accessing another user's plan/actual by id).
- Password reset flow and email verification.
- Category rename/delete with safe handling of existing plans/actuals.
- Postgres + a proper migration tool (e.g. `node-pg-migrate`) instead of
  the idempotent `CREATE TABLE IF NOT EXISTS` approach, which is fine for a
  single SQLite file but doesn't give you real migration history.
- Rate limiting on auth endpoints.
- CSV export of the report (listed as a stretch goal, not implemented here
  due to time).
- Drill-down from a report cell to underlying actual entries (also a
  stretch goal, not implemented).
