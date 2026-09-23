// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';

// The list endpoints filter source/status by enum NAME (CASH, SUCCESS) even
// though they return the values in lower case — normalise before sending.
function txQuery(params = {}) {
  const p = { ...params };
  if (p.source) p.source = String(p.source).toUpperCase();
  if (p.status) p.status = String(p.status).toUpperCase();
  return new URLSearchParams(p).toString();
}

// Transactions
export async function apiGetTransactions(params = {}) {
  const q = txQuery(params);
  return apiFetch(`/transactions${q ? '?' + q : ''}`);
}

export async function apiGetUnassignedTransactions(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/transactions/unassigned${q ? '?' + q : ''}`);
}

export async function apiGetTransactionsWithName(params = {}) {
  const q = txQuery(params);
  return apiFetch(`/transactions/withname${q ? '?' + q : ''}`);
}

export async function apiGetTransactionStats(params = {}) {
  const q = txQuery(params);
  return apiFetch(`/transactions/transactionstatistics${q ? '?' + q : ''}`);
}

export async function apiCreateManualTransaction(data) {
  return apiFetch('/transactions/manual', { method: 'POST', body: JSON.stringify(data) });
}

export async function apiCreateManualTransactionWithProof(formData) {
  return apiFetch('/transactions/manual/with-proof', { method: 'POST', body: formData });
}

export async function apiAssignTransaction(id, data) {
  return apiFetch(`/transactions/${id}/assign`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiCancelTransaction(id) {
  return apiFetch(`/transactions/${id}/cancel`, { method: 'PATCH' });
}

export async function apiDeleteTransaction(id) {
  return apiFetch(`/transactions/${id}`, { method: 'DELETE' });
}

export async function apiDeleteTransactionsBulk(ids) {
  return apiFetch('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify(ids) });
}

export async function apiGetTransaction(id) {
  return apiFetch(`/transactions/${id}`);
}
