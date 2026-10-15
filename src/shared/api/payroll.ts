// @ts-nocheck
import { apiFetch } from './client';

/**
 * Salaries (FRONTEND_FINANCE_API.md §3): a standing rate per employee, payments
 * against what they earned (part payments included), bonuses and penalties,
 * and closing a month. Wages live here only — the coach_salary/staff_salary
 * expense categories are the old way and are no longer counted.
 */

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

const json = (method, data) => ({ method, body: JSON.stringify(data ?? {}) });

export async function apiGetPayrollEmployees(params = {}) {
  return apiFetch(`/payroll/employees${query(params)}`);
}

export async function apiGetPayrollProfiles(params = {}) {
  return apiFetch(`/payroll/profiles${query(params)}`);
}

export async function apiSetSalaryProfile(userId, data) {
  return apiFetch(`/payroll/users/${userId}/salary-profile`, json('PUT', data));
}

export async function apiDeleteSalaryProfile(userId) {
  return apiFetch(`/payroll/users/${userId}/salary-profile`, { method: 'DELETE' });
}

export async function apiGetPayrollPayments(params = {}) {
  return apiFetch(`/payroll/payments${query(params)}`);
}

export async function apiCreatePayrollPayment(data) {
  return apiFetch('/payroll/payments', json('POST', data));
}

export async function apiUpdatePayrollPayment(id, data) {
  return apiFetch(`/payroll/payments/${id}`, json('PATCH', data));
}

export async function apiDeletePayrollPayment(id) {
  return apiFetch(`/payroll/payments/${id}`, { method: 'DELETE' });
}

export async function apiGetPayrollAdjustments(params = {}) {
  return apiFetch(`/payroll/adjustments${query(params)}`);
}

export async function apiCreatePayrollAdjustment(data) {
  return apiFetch('/payroll/adjustments', json('POST', data));
}

export async function apiUpdatePayrollAdjustment(id, data) {
  return apiFetch(`/payroll/adjustments/${id}`, json('PATCH', data));
}

export async function apiDeletePayrollAdjustment(id) {
  return apiFetch(`/payroll/adjustments/${id}`, { method: 'DELETE' });
}

export async function apiGetPayrollSummary(params = {}) {
  return apiFetch(`/payroll/summary${query(params)}`);
}

export async function apiClosePayrollMonth(data) {
  return apiFetch('/payroll/closures', json('POST', data));
}

export async function apiReopenPayrollMonth(year, month, params = {}) {
  return apiFetch(`/payroll/closures/${year}/${month}${query(params)}`, { method: 'DELETE' });
}
