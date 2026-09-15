// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';
import { apiBlob, toApiPath } from './client';

// Students
export async function apiGetStudents(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/students${q ? '?' + q : ''}`);
}

export async function apiGetStudent(id) {
  return apiFetch(`/students/${id}`);
}

export async function apiCreateStudent(formData) {
  return apiFetch('/students', { method: 'POST', body: formData });
}

export async function apiUpdateStudent(id, formData) {
  return apiFetch(`/students/${id}`, { method: 'PATCH', body: formData });
}

export async function apiDeleteStudent(id) {
  return apiFetch(`/students/${id}`, { method: 'DELETE' });
}

export async function apiHardDeleteStudent(id) {
  return apiFetch(`/students/${id}/hard-delete`, { method: 'DELETE' });
}

export async function apiGetStudentFullInfo(id) {
  return apiFetch(`/students/fullinfo/${id}`);
}

export async function apiGetStudentAttendance(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/students/${id}/attendance${q ? '?' + q : ''}`);
}

export async function apiGetStudentTransactions(id) {
  return apiFetch(`/students/${id}/transactions`);
}

export async function apiGetStudentGateLogs(id) {
  return apiFetch(`/students/${id}/gatelogs`);
}

export async function apiGetStudentAttendanceReport(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/reports/attendance/students/${id}${q ? '?' + q : ''}`);
}

export async function apiGetStudentContracts(id) {
  return apiFetch(`/students/${id}/contract`);
}

export async function apiGetStudentContract(id) {
  return apiGetStudentContracts(id);
}

export async function apiSearchStudents(query, params = {}) {
  const q = new URLSearchParams({ query, ...params }).toString();
  return apiFetch(`/students/search${q ? '?' + q : ''}`);
}

export async function apiGetStudentsComprehensiveExportUrl() {
  return `${BASE_URL}/students/comprehensive-export`;
}

export async function apiDownloadGroupStudentsExport(id) {
  return (await apiBlob(`/groups/${id}/export-students`)).blob;
}

export async function apiDownloadStudentFile(url: string) {
  const apiPath = toApiPath(url);
  if (apiPath) {
    const { blob, filename } = await apiBlob(apiPath);
    return { blob, filename: filename || 'file' };
  }
  // Files on another host (storage/CDN) must not receive our bearer token
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Xatolik: ${res.status}`);
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = match ? match[1].replace(/['"]/g, '') : 'file';
  return { blob: await res.blob(), filename };
}

export async function apiDownloadStudentsComprehensiveExport() {
  return (await apiBlob('/students/comprehensive-export')).blob;
}

export async function apiGetStudentsAttendanceAll(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/students/attendances/all${q ? '?' + q : ''}`);
}

export async function apiDeleteStudentsBulk(ids) {
  return apiFetch('/students/bulk-delete', { method: 'POST', body: JSON.stringify(ids) });
}

export async function apiImportStudents(formData) {
  return apiFetch('/import/students', { method: 'POST', body: formData });
}

export async function apiUploadStudentPassport(id, formData) {
  return apiFetch(`/students/${id}/passport`, { method: 'POST', body: formData });
}

export async function apiUploadStudentExtraFile(id, formData) {
  return apiFetch(`/students/${id}/extra-file`, { method: 'POST', body: formData });
}
// Students extra
export async function apiChangeStudentGroup(id, group_id) {
  return apiFetch(`/students/${id}/group?group_id=${encodeURIComponent(group_id)}`, { method: 'PATCH' });
}

export async function apiGetStudentForContract(id) {
  return apiFetch(`/students/${id}`);
}

export async function apiUploadStudentPhoto(id, formData) {
  return apiFetch(`/students/${id}/photo`, { method: 'POST', body: formData });
}
