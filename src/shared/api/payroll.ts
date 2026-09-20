// @ts-nocheck
import { apiFetch } from './client';

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

// Payroll (MOBILE_API_PAYROLL_UPDATE.md): salary profiles per user, bonuses /
// penalties, payouts, and month closures. Sundays are not workdays.
export async function apiGetPayrollSummary(params = {}) {
  return apiFetch(`/payroll/summary${query(params)}`);
}
export async function apiGetPayrollEmployees(params = {}) {
  return apiFetch(`/payroll/employees${query(params)}`);
}
export async function apiGetSalaryProfiles(params = {}) {
  return apiFetch(`/payroll/profiles${query(params)}`);
}
export async function apiUpsertSalaryProfile(userId, data) {
  return apiFetch(`/payroll/users/${userId}/salary-profile`, { method: 'PUT', body: JSON.stringify(data) });
}
export async function apiGetPayrollAdjustments(params = {}) {
  return apiFetch(`/payroll/adjustments${query(params)}`);
}
export async function apiCreatePayrollAdjustment(data) {
  return apiFetch('/payroll/adjustments', { method: 'POST', body: JSON.stringify(data) });
}
export async function apiUpdatePayrollAdjustment(id, data) {
  return apiFetch(`/payroll/adjustments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function apiDeletePayrollAdjustment(id) {
  return apiFetch(`/payroll/adjustments/${id}`, { method: 'DELETE' });
}
export async function apiGetPayrollPayments(params = {}) {
  return apiFetch(`/payroll/payments${query(params)}`);
}
export async function apiCreatePayrollPayment(data) {
  return apiFetch('/payroll/payments', { method: 'POST', body: JSON.stringify(data) });
}
export async function apiUpdatePayrollPayment(id, data) {
  return apiFetch(`/payroll/payments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function apiDeletePayrollPayment(id) {
  return apiFetch(`/payroll/payments/${id}`, { method: 'DELETE' });
}
/** Close a month for the given users (empty list = every active profile). */
export async function apiClosePayrollMonth(data) {
  return apiFetch('/payroll/closures', { method: 'POST', body: JSON.stringify(data) });
}
export async function apiReopenPayrollMonth(year, month, userId) {
  return apiFetch(`/payroll/closures/${year}/${month}${query({ user_id: userId })}`, { method: 'DELETE' });
}
