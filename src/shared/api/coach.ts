// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';
import { apiBlob } from './client';

export async function apiGetHeadCoachGroups() {
  return apiFetch('/head-coach/groups');
}

// Attendance (coach)
export async function apiGetCoachSessions(params = {}) {
  const q = buildQuery(params, ['date', 'from_date', 'to_date', 'group_id'], { session_date: 'date' });
  return apiFetch(`/coach/sessions${q ? '?' + q : ''}`);
}

export async function apiGetCoachGroups() {
  return apiFetch('/coach/groups');
}

export async function apiGetCoachAttendanceStats(groupId) {
  return apiFetch(`/coach/groups/${groupId}/attendance-stats`);
}

export async function apiGetCoachStudentAttendanceStats(studentId) {
  return apiFetch(`/coach/students/${studentId}/attendance-stats`);
}

export async function apiGetCoachMyAttendances(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/coach/my-attendances${q ? '?' + q : ''}`);
}

export async function apiGetCoachGroupPerformanceTable(groupId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch(`/coach/groups/${groupId}/performance-table${q ? '?' + q : ''}`);
}

export async function apiSaveCoachGroupPerformanceTable(groupId, data) {
  return apiFetch(`/coach/groups/${groupId}/performance-table`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function apiCreateCoachPerformanceTableColumn(groupId, data) {
  return apiFetch(`/coach/groups/${groupId}/performance-table/columns`, { method: 'POST', body: JSON.stringify(data) });
}

export async function apiUpdateCoachPerformanceTableColumn(groupId, matchId, data) {
  return apiFetch(`/coach/groups/${groupId}/performance-table/columns/${matchId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiDeleteCoachPerformanceTableColumn(groupId, colId, season_year) {
  return apiFetch(`/coach/groups/${groupId}/performance-table/columns/${colId}?season_year=${encodeURIComponent(season_year)}`, { method: 'DELETE' });
}

export async function apiReorderCoachPerformanceTableColumns(groupId, data) {
  return apiFetch(`/coach/groups/${groupId}/performance-table/columns-reorder`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiGetCoachGroupPerformanceTableExportUrl(groupId, season_year) {
  return `${BASE_URL}/coach/groups/${groupId}/performance-table/export?season_year=${encodeURIComponent(season_year)}`;
}

export async function apiDownloadCoachGroupPerformanceTableExport(groupId, season_year) {
  return (await apiBlob(`/coach/groups/${groupId}/performance-table/export?season_year=${encodeURIComponent(season_year)}`)).blob;
}

export async function apiUploadCoachSessionKonspekt(sessionId, formData) {
  return apiFetch(`/coach/sessions/${sessionId}/upload-konspekt`, { method: 'POST', body: formData });
}

export async function apiMarkAttendance(sessionId, data) {
  return apiFetch(`/coach/sessions/${sessionId}/attendance`, { method: 'POST', body: JSON.stringify(data) });
}

// The API exposes no PUT for a single mark; bulk-attendance updates existing records.
export async function apiUpdateAttendance(sessionId, data) {
  return apiMarkBulkAttendance(sessionId, [data]);
}

export async function apiMarkBulkAttendance(sessionId, attendances) {
  return apiFetch(`/coach/sessions/${sessionId}/bulk-attendance`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, attendances }),
  });
}

// Performance Table
export async function apiAddPerformanceTableMatch(groupId, matchData) {
  return apiFetch(`/coach/groups/${groupId}/performance-table/columns`, {
    method: 'POST',
    body: JSON.stringify(matchData),
  });
}
