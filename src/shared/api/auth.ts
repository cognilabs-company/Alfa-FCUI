// @ts-nocheck
import {
  apiFetch, BASE_URL, buildQuery, getToken, setTokens, clearTokens,
  unwrapData, unwrapDataArray,
  normalizeContractMonthlyFeePayload, normalizeContractDatesPayload,
} from './client';
import { rememberLoginId, forgetLoginId } from '../lib/maintenance';

// Auth
export async function apiLogin(phone_or_email, password) {
  const res = await fetch(BASE_URL + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_or_email, password }),
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) throw new Error(json.detail || 'Login xatolik');
  const auth = json.data || json;
  setTokens(auth.access_token, auth.refresh_token);
  rememberLoginId(phone_or_email);
  return auth;
}

export async function apiGetMe() {
  const data = unwrapData(await apiFetch('/auth/me'));
  // API may return { user: {...}, permissions: [...] } or the user object directly
  const user = data?.user ?? data;
  const permissions = data?.permissions || user?.permissions || [];
  return {
    user,
    permissions,
    data,
  };
}

export function apiLogout() { clearTokens(); forgetLoginId(); }
