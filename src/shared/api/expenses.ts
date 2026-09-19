// @ts-nocheck
import { apiFetch } from './client';

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

// Expenses (EXPENSES_BACKEND.md): fixed (recurring monthly) and additional (one-off)
export async function apiGetExpenses(params = {}) {
  return apiFetch(`/expenses${query(params)}`);
}

export async function apiGetExpense(id) {
  return apiFetch(`/expenses/${id}`);
}

export async function apiCreateExpense(data) {
  return apiFetch('/expenses', { method: 'POST', body: JSON.stringify(data) });
}

export async function apiUpdateExpense(id, data) {
  return apiFetch(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiDeleteExpense(id) {
  return apiFetch(`/expenses/${id}`, { method: 'DELETE' });
}

/** Period total, fixed/additional split, by category and per month. */
export async function apiGetExpensesSummary(params = {}) {
  return apiFetch(`/expenses/summary${query(params)}`);
}
