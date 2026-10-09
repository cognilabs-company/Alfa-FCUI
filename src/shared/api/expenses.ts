// @ts-nocheck
import { apiFetch } from './client';

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

const json = (method, data) => ({ method, body: JSON.stringify(data ?? {}) });

export async function apiGetExpensePlans(params = {}) {
  return apiFetch(`/expense-plans${query(params)}`);
}

export async function apiCreateExpensePlan(data) {
  return apiFetch('/expense-plans', json('POST', data));
}

export async function apiUpdateExpensePlan(id, data) {
  return apiFetch(`/expense-plans/${id}`, json('PATCH', data));
}

export async function apiDeleteExpensePlan(id) {
  return apiFetch(`/expense-plans/${id}`, { method: 'DELETE' });
}

export async function apiRestoreExpensePlan(id) {
  return apiFetch(`/expense-plans/${id}/restore`, json('POST'));
}

export async function apiGetExpenses(params = {}) {
  return apiFetch(`/expenses${query(params)}`);
}

const SUMMARY_KEYS = ['total_amount', 'total_paid', 'total_unpaid', 'unpaid_count', 'paid_count', 'partial_count'];

async function fetchCategoryRows(category, params, maxPages) {
  const rows = [];
  let summary = null;
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await apiGetExpenses({ ...params, category, page, page_size: 200 });
    if (page === 1) {
      summary = res?.meta?.summary || null;
      total = Number(res?.meta?.total) || 0;
    }
    const data = res?.data || [];
    rows.push(...data);
    const pages = Number(res?.meta?.total_pages) || 1;
    if (page >= pages || data.length === 0) break;
  }
  return { rows, summary, total };
}

export async function apiGetExpensesByCategories(categories, params = {}, { maxPages = 10 } = {}) {
  const parts = await Promise.all(categories.map(c => fetchCategoryRows(c, params, maxPages)));
  const summary = Object.fromEntries(SUMMARY_KEYS.map(k => [k, parts.reduce((s, p) => s + (Number(p.summary?.[k]) || 0), 0)]));
  const rows = parts.flatMap(p => p.rows).sort((a, b) =>
    (b.period_year - a.period_year)
    || (b.period_month - a.period_month)
    || String(a.coach_name || a.title || '').localeCompare(String(b.coach_name || b.title || ''))
    || (a.id - b.id));
  const total = parts.reduce((s, p) => s + p.total, 0);
  return { data: rows, meta: { total, summary, truncated: rows.length < total } };
}

export async function apiGetExpense(id) {
  return apiFetch(`/expenses/${id}`);
}

export async function apiCreateExpense(data) {
  return apiFetch('/expenses', json('POST', data));
}

export async function apiUpdateExpense(id, data) {
  return apiFetch(`/expenses/${id}`, json('PATCH', data));
}

export async function apiDeleteExpense(id) {
  return apiFetch(`/expenses/${id}`, { method: 'DELETE' });
}

export async function apiRestoreExpense(id) {
  return apiFetch(`/expenses/${id}/restore`, json('POST'));
}

export async function apiPayExpense(id, data) {
  return apiFetch(`/expenses/${id}/pay`, json('POST', data));
}

export async function apiGenerateExpenses(data) {
  return apiFetch('/expenses/generate', json('POST', data));
}

export async function apiGenerateRecurringExpenses(params = {}) {
  return apiFetch(`/expenses/generate-recurring${query(params)}`, json('POST'));
}

export async function apiGetPayrollReport(params = {}) {
  return apiFetch(`/reports/payroll${query(params)}`);
}

export async function apiGetExpensesReport(params = {}) {
  return apiFetch(`/reports/expenses${query(params)}`);
}

function monthsBetween(fromDate, toDate) {
  const now = new Date();
  const from = fromDate ? new Date(`${fromDate.slice(0, 7)}-01T00:00:00`) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = toDate ? new Date(`${toDate.slice(0, 7)}-01T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const out = [];
  for (let d = new Date(from); d <= to && out.length < 36; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

export async function apiGetExpensesMonthly({ from_date, to_date } = {}) {
  const months = monthsBetween(from_date, to_date);
  const results = await Promise.all(months.map(({ year, month }) => apiGetExpensesReport({ year, month })));
  const monthly = months.map(({ year, month }, i) => {
    const rows = results[i]?.data || [];
    const sum = (k) => rows.reduce((s, r) => s + (Number(r?.[k]) || 0), 0);
    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      payable: sum('payable'),
      paid: sum('paid'),
      unpaid: sum('unpaid'),
      total: sum('paid'),
    };
  });
  return { data: { monthly } };
}
