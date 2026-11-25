// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';

// Sessions
export async function apiGetSessions(params = {}) {
  const q = buildQuery(params, ['date', 'from_date', 'to_date', 'group_id'], { session_date: 'date' });
  const qs = q ? '?' + q : '';
  try {
    return await apiFetch(`/head-coach/sessions${qs}`);
  } catch (err) {
    // A plain coach holds sessions:create but not sessions:manage, so the
    // head-coach list answers 403. Their own sessions live under /coach, which
    // takes the same params and returns the same shape. Mirrors the mobile app.
    if (err?.status === 403) return apiFetch(`/coach/sessions${qs}`);
    throw err;
  }
}

export async function apiCreateSession(data) {
  return apiFetch('/head-coach/sessions', { method: 'POST', body: JSON.stringify(data) });
}

export async function apiCreateHeadCoachSessionsBulk(data) {
  return apiFetch('/head-coach/sessions/bulk', { method: 'POST', body: JSON.stringify(data) });
}

export async function apiUpdateSession(id, data) {
  return apiFetch(`/head-coach/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function apiDeleteSession(id) {
  return apiFetch(`/head-coach/sessions/${id}`, { method: 'DELETE' });
}

export async function apiGetSessionDetails(id) {
  try {
    return await apiFetch(`/head-coach/sessions/${id}`);
  } catch (err) {
    // Same reason as apiGetSessions: a plain coach reads a session under /coach.
    if (err?.status === 403) return apiFetch(`/coach/sessions/${id}`);
    throw err;
  }
}

export async function apiGetCoachSessionDetails(id) {
  return apiFetch(`/coach/sessions/${id}`);
}
