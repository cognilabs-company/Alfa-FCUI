// @ts-nocheck
import { apiFetch } from './client';

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
