// @ts-nocheck
import { apiFetch } from './client';
import { http } from './http';

/**
 * Pending students (PENDING_STUDENTS_FRONTEND_GUIDE.md): a child who has
 * started training but has not brought the paperwork yet. They live in their
 * own table — out of /students, out of every count, report and contract — until
 * the documents arrive and `complete` turns the record into a real student plus
 * a contract in one call.
 */

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export async function apiGetPendingStudents(params = {}) {
  return apiFetch(`/students/pending-documents${query(params)}`);
}

export async function apiCreatePendingStudent(data) {
  return apiFetch('/students/pending-documents', { method: 'POST', body: JSON.stringify(data) });
}

export async function apiUpdatePendingStudent(id, data) {
  return apiFetch(`/students/pending-documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiDeletePendingStudent(id) {
  return apiFetch(`/students/pending-documents/${id}`, { method: 'DELETE' });
}

/** Documents arrived: creates the student and the contract. FormData (files optional). */
export async function apiCompletePendingStudent(id, formData) {
  return apiFetch(`/students/pending-documents/${id}/complete`, { method: 'POST', body: formData });
}

/**
 * Can a pending record carry the short first payment? Answered from the
 * schema, the same way the student form asks about its own prorated fields:
 * "yes" holds for the session, "no" is rechecked a few minutes later so the
 * switch enables itself once the backend ships instead of staying dead.
 */
const PRORATED_CACHE_KEY = 'alpha_caps_pending_prorated';
const RECHECK_MS = 5 * 60 * 1000;
let probe = null;
export function apiSupportsPendingProrated() {
  if (probe) return probe;
  try {
    const [flag, at] = String(sessionStorage.getItem(PRORATED_CACHE_KEY) || '').split(':');
    if (flag && (flag === '1' || (at && Date.now() - Number(at) < RECHECK_MS))) {
      return (probe = Promise.resolve(flag === '1'));
    }
  } catch { /* private mode */ }
  probe = http.get('/openapi.json')
    .then((res) => {
      const props = res?.data?.components?.schemas?.PendingStudentCreate?.properties || {};
      const ok = Object.prototype.hasOwnProperty.call(props, 'initial_payment_amount');
      try { sessionStorage.setItem(PRORATED_CACHE_KEY, `${ok ? '1' : '0'}:${Date.now()}`); } catch { /* private mode */ }
      if (!ok) probe = null;
      return ok;
    })
    .catch(() => { probe = null; return false; });
  return probe;
}
