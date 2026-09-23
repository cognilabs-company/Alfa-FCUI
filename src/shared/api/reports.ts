// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';
import { apiBlob } from './client';

// Reports
export async function apiGetDashboard() {
  return apiFetch('/reports/dashboard/summary');
}

export async function apiGetDebtors(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/reports/debtors${q ? '?' + q : ''}`);
}
export async function apiGetPayers(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/reports/payers${q ? '?' + q : ''}`);
}

export async function apiGetFinanceReport(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/reports/finance${q ? '?' + q : ''}`);
}

export async function apiGetReportsSummary() {
  return unwrapData(await apiGetDashboard()) || {};
}

export async function apiGetReportsRevenueDynamics(group_by = 'month') {
  const q = new URLSearchParams({ group_by }).toString();
  return unwrapDataArray(await apiFetch(`/reports/revenue-dynamics${q ? '?' + q : ''}`));
}

export async function apiGetReportsPaymentsBySource() {
  return unwrapDataArray(await apiFetch('/reports/payments-by-source'));
}

export async function apiGetReportsTerminatedSummary() {
  return apiFetch('/reports/terminated-summary');
}

export async function apiGetAttendanceGroupsReport(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/reports/attendance/groups${q ? '?' + q : ''}`);
}

export function apiPayersExportUrl(params = {}) {
  const q = new URLSearchParams(params).toString();
  return `${BASE_URL}/reports/payers/export${q ? '?' + q : ''}`;
}

export function apiDebtorsExportUrl() {
  return `${BASE_URL}/reports/debtors/export`;
}

export function apiPaymentsExcelUrl(params = {}) {
  const q = new URLSearchParams(params).toString();
  return `${BASE_URL}/reports/payments-excel${q ? '?' + q : ''}`;
}

const withQuery = (path, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return path + (q ? '?' + q : '');
};

export async function apiDownloadPaymentsExcel(params = {}) {
  return (await apiBlob(withQuery('/reports/payments-excel', params))).blob;
}

export async function apiDownloadDebtors(params = {}) {
  return (await apiBlob(withQuery('/reports/debtors/export', params))).blob;
}

export async function apiDownloadPayers(params = {}) {
  return (await apiBlob(withQuery('/reports/payers/export', params))).blob;
}
