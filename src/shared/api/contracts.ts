// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';
import { apiBlob } from './client';

// Contracts
export async function apiGetContracts(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/contracts${q ? '?' + q : ''}`);
}

export async function apiGetContractStats() {
  return apiFetch('/contracts/stats');
}

export async function apiGetContract(id) {
  return apiFetch(`/contracts/${id}`);
}

export async function apiGetTerminatedContracts(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/contracts/terminated${q ? '?' + q : ''}`);
}

export async function apiUpdateContract(id, data) {
  return apiFetch(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiTerminateContract(id, data) {
  return apiFetch(`/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify(data) });
}

export async function apiPatchContractStatus(id, data) {
  return apiFetch(`/contracts/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiPatchContractMonthlyFee(id, data) {
  return apiUpdateContract(id, normalizeContractMonthlyFeePayload(data));
}

export async function apiPatchContractDates(id, data) {
  return apiUpdateContract(id, normalizeContractDatesPayload(data));
}

export async function apiRegenerateContractPdf(id) {
  return apiFetch(`/contracts/${id}/regenerate-pdf`, { method: 'POST' });
}

export async function apiGetContractPdf(id) {
  return (await apiBlob(`/contracts/${id}/pdf`)).blob;
}

export function apiContractPdfUrl(id) {
  return `${BASE_URL}/contracts/${id}/pdf`;
}
