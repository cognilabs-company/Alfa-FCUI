// @ts-nocheck
/**
 * Aggregation helpers for the analytics screens.
 *
 * The API has no aggregate endpoints yet (see ANALYTICS_BACKEND.md), so the
 * series are folded here from the raw lists. Everything in this file is pure:
 * same input, same output, no fetching.
 */

const PAID_STATUSES = new Set(['success', 'completed', 'settled', 'paid']);
export const SOURCES = ['payme', 'click', 'cash', 'bank', 'other'];

/** The API sometimes returns the enum repr ("PaymentSource.CASH") instead of its value. */
export function normalizeSource(value) {
  const s = String(value || '').toLowerCase().replace(/^paymentsource\./, '').trim();
  if (s === 'manual') return 'cash';
  return SOURCES.includes(s) ? s : 'other';
}

export function isPaid(tx) {
  return PAID_STATUSES.has(String(tx?.status || '').toLowerCase());
}

/** Payment date: when money actually arrived, falling back to the row's creation. */
export function txDate(tx) {
  return tx?.paid_at || tx?.created_at || null;
}

const pad = (n) => String(n).padStart(2, '0');
export const monthKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const dayKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The last `n` months, oldest first: [{ key: '2026-09', date }] */
export function monthsBack(n, ref = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push({ key: monthKey(d), date: d });
  }
  return out;
}

/** The last `n` days, oldest first. */
export function daysBack(n, ref = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - i);
    out.push({ key: dayKey(d), date: d });
  }
  return out;
}

/**
 * Money in per period, split by source.
 * → [{ key, date, value, count, parts: { payme, click, cash, bank, other } }]
 */
export function revenueSeries(transactions, periods, keyOf = monthKey) {
  const slots = new Map(periods.map(p => [p.key, {
    ...p, value: 0, count: 0, parts: Object.fromEntries(SOURCES.map(s => [s, 0])),
  }]));
  for (const tx of transactions || []) {
    if (!isPaid(tx)) continue;
    const slot = slots.get(keyOf(txDate(tx)));
    if (!slot) continue;
    const amount = Number(tx.amount) || 0;
    slot.value += amount;
    slot.count += 1;
    slot.parts[normalizeSource(tx.source)] += amount;
  }
  return [...slots.values()];
}

/** Totals per payment source over the whole set. */
export function sourceTotals(transactions) {
  const out = Object.fromEntries(SOURCES.map(s => [s, { amount: 0, count: 0 }]));
  for (const tx of transactions || []) {
    if (!isPaid(tx)) continue;
    const s = out[normalizeSource(tx.source)];
    s.amount += Number(tx.amount) || 0;
    s.count += 1;
  }
  return out;
}

export function paidTotal(transactions) {
  return (transactions || []).reduce((sum, tx) => (isPaid(tx) ? sum + (Number(tx.amount) || 0) : sum), 0);
}

/** How many distinct students paid in the set. */
export function payingStudents(transactions) {
  const ids = new Set();
  for (const tx of transactions || []) if (isPaid(tx) && tx.student_id != null) ids.add(tx.student_id);
  return ids.size;
}

/** Debt split by how many months are overdue — the standard aging view. */
export function debtAging(debtors) {
  const buckets = [
    { key: '1', min: 1, max: 1, count: 0, amount: 0 },
    { key: '2', min: 2, max: 2, count: 0, amount: 0 },
    { key: '3', min: 3, max: 3, count: 0, amount: 0 },
    { key: '4+', min: 4, max: Infinity, count: 0, amount: 0 },
  ];
  for (const d of debtors || []) {
    const months = Number(d.overdue_months_count) || (d.overdue_months || []).length || 1;
    const b = buckets.find(x => months >= x.min && months <= x.max);
    if (!b) continue;
    b.count += 1;
    b.amount += Number(d.debt_amount) || 0;
  }
  return buckets;
}

export function debtTotal(debtors) {
  return (debtors || []).reduce((s, d) => s + (Number(d.debt_amount) || 0), 0);
}

/** Debt grouped by training group, biggest first. */
export function debtByGroup(debtors, limit = 8) {
  const map = new Map();
  for (const d of debtors || []) {
    const name = d.group_name || '—';
    map.set(name, (map.get(name) || 0) + (Number(d.debt_amount) || 0));
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value).slice(0, limit);
}

export function ageOf(dateOfBirth, ref = new Date()) {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (isNaN(d)) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 100 ? age : null;
}

/** Age histogram, one column per year present in the data. */
export function ageBuckets(students, ref = new Date()) {
  const map = new Map();
  for (const s of students || []) {
    const age = ageOf(s.date_of_birth, ref);
    if (age == null) continue;
    map.set(age, (map.get(age) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([age, count]) => ({ age, count }));
}

/** New students per month plus the running total at the end of each month. */
export function studentGrowth(students, periods) {
  const added = new Map(periods.map(p => [p.key, 0]));
  let before = 0;
  const firstKey = periods[0]?.key;
  for (const s of students || []) {
    const key = monthKey(s.created_at);
    if (!key) continue;
    if (added.has(key)) added.set(key, added.get(key) + 1);
    else if (firstKey && key < firstKey) before += 1;
  }
  let running = before;
  return periods.map(p => {
    const value = added.get(p.key) || 0;
    running += value;
    return { ...p, value, total: running };
  });
}

/** Sessions held per period (schedule load). */
export function sessionsPerPeriod(sessions, periods, keyOf = monthKey) {
  const slots = new Map(periods.map(p => [p.key, { ...p, value: 0 }]));
  for (const s of sessions || []) {
    const slot = slots.get(keyOf(s.session_date));
    if (slot) slot.value += 1;
  }
  return [...slots.values()];
}

export function countBy(items, keyOf) {
  const map = new Map();
  for (const it of items || []) {
    const k = keyOf(it);
    if (k == null) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

/** Percentage change against the previous period; null when there is no base. */
export function delta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ── Aggregate endpoints (ANALYTICS_BACKEND_IMPLEMENTED.md) ─────────────────

/** "2026-08" / "2026-08-16" / "2026-W36" → a Date the charts can label. */
export function periodDate(period, fallbackFrom) {
  const s = String(period || '');
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, 1);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{4})-W(\d{1,2})$/i);
  if (m) {
    // ISO week: week 1 holds Jan 4th; Monday of the requested week.
    const jan4 = new Date(+m[1], 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (+m[2] - 1) * 7);
    return monday;
  }
  const d = fallbackFrom ? new Date(fallbackFrom) : new Date(s);
  return isNaN(d) ? new Date() : d;
}

/** revenue-dynamics rows → the shape the charts already speak. */
export function seriesFromDynamics(rows) {
  return (rows || []).map((r) => {
    const parts = Object.fromEntries(SOURCES.map(s => [s, 0]));
    for (const b of r.by_source || []) parts[normalizeSource(b.source)] += Number(b.amount) || 0;
    return {
      key: r.period,
      date: periodDate(r.period, r.from_date),
      value: Number(r.total_amount) || 0,
      count: Number(r.transaction_count) || 0,
      parts,
    };
  });
}

/** Totals per source across a dynamics series. */
export function sourceTotalsFromSeries(series) {
  const out = Object.fromEntries(SOURCES.map(s => [s, { amount: 0, count: 0 }]));
  for (const p of series || []) {
    for (const [k, v] of Object.entries(p.parts || {})) {
      if (out[k]) out[k].amount += Number(v) || 0;
    }
  }
  return out;
}

/** Rates come as 0–1 from the API; charts want percent. */
export function rateToPercent(v) {
  const n = Number(v) || 0;
  return n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

/** debt-aging buckets → the bar rows the chart expects. */
export function agingFromApi(buckets) {
  return (buckets || []).map((b) => ({
    key: String(b.months_overdue),
    count: Number(b.students) || 0,
    amount: Number(b.amount) || 0,
  }));
}
