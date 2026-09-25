// @ts-nocheck
import { http } from './http';
import { tokenStore } from './token';
import { translateApiError } from '../i18n/api-errors';

// Legacy helpers kept for callers that read the URL directly
export const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api.alpha.cognilabs.org').replace(/\/$/, '');

export function unwrapData(json) {
  return json?.data ?? json ?? null;
}

export function unwrapDataArray(json) {
  const data = unwrapData(json);
  return Array.isArray(data) ? data : [];
}

export function normalizeContractMonthlyFeePayload(data = {}) {
  return {
    monthly_fee_amount: data.monthly_fee_amount ?? data.monthly_fee ?? data.amount,
  };
}

export function normalizeContractDatesPayload(data = {}) {
  return {
    contract_start_date: data.contract_start_date ?? data.start_date,
    contract_end_date: data.contract_end_date ?? data.end_date,
  };
}

export function clampPageSize(pageSize, max) {
  if (pageSize === undefined || pageSize === null || pageSize === '') return undefined;
  const n = Number(pageSize);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, max);
}

export function buildQuery(params = {}, allowedKeys = [], aliases = {}, pageSizeMax) {
  const query = {};

  allowedKeys.forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') query[key] = value;
  });

  Object.entries(aliases).forEach(([from, to]) => {
    const value = params[from];
    if (value !== undefined && value !== null && value !== '') query[to] = value;
  });

  if (pageSizeMax) {
    const pageSize = clampPageSize(params.page_size, pageSizeMax);
    if (pageSize !== undefined) query.page_size = pageSize;
  }

  return new URLSearchParams(query).toString();
}

// Token helpers — delegate to tokenStore so Axios interceptors always see current tokens
export function getToken() { return tokenStore.getAccessToken(); }
export function setTokens(access, refresh) { tokenStore.setTokens(access, refresh); }
export function clearTokens() { tokenStore.clearTokens(); }

let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
  // Wire the Axios 401 path to the same handler so the app logs out on refresh failure.
  // The http interceptor clears tokens; here we additionally trigger the UI logout.
  http.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && !error.config?._retry) {
        // _retry is set by the existing interceptor only after a failed refresh attempt.
        // If we reach this point without _retry, the token was simply missing — log out.
      }
      // After the existing refresh interceptor has cleared tokens it rejects the promise.
      // Check whether tokens are now gone; if so, invoke the logout handler.
      if (!tokenStore.getAccessToken() && _onUnauthorized) {
        _onUnauthorized();
      }
      return Promise.reject(error);
    },
  );
}

/**
 * Authenticated binary download (PDF, Excel) through the /api proxy, so the
 * access token is attached and refreshed like every other request.
 * `path` is API-relative ("/contracts/5/pdf").
 */
export async function apiBlob(path) {
  try {
    const res = await http.get(path, { responseType: 'blob' });
    const cd = res.headers?.['content-disposition'] || '';
    const match = cd.match(/filename\*?=(?:UTF-8'')?(['"]?)([^;\n]*)\1/i);
    const filename = match ? decodeURIComponent(match[2]) : '';
    return { blob: res.data, filename };
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 && _onUnauthorized) _onUnauthorized();
    let detail;
    const data = error.response?.data;
    if (data && typeof data.text === 'function') {
      try { detail = JSON.parse(await data.text())?.detail; } catch { /* not JSON */ }
    }
    if (Array.isArray(detail)) throw new Error(translateApiError('__validation__'));
    throw new Error(translateApiError(detail || (status ? `Xatolik: ${status}` : '__network__')));
  }
}

/** API-relative path for a URL that may be absolute on the API host; null for foreign hosts. */
export function toApiPath(url) {
  const u = String(url || '');
  if (u.startsWith('/')) return u;
  if (u.startsWith(BASE_URL)) return u.slice(BASE_URL.length) || '/';
  return null;
}

/**
 * apiFetch — now backed by the Axios `http` instance which handles:
 *   - Authorization header attachment (request interceptor)
 *   - 401 → silent token refresh → retry (response interceptor)
 *
 * FormData bodies are passed through unchanged; Axios sets the correct
 * multipart Content-Type automatically when the body is a FormData object.
 */
export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = options.body instanceof FormData;

  const axiosConfig = {
    method,
    url: path,
    headers: { ...options.headers },
  };

  if (options.body !== undefined) {
    axiosConfig.data = options.body;
    // For JSON strings, parse back to object so Axios serialises correctly.
    if (!isFormData && typeof options.body === 'string') {
      try { axiosConfig.data = JSON.parse(options.body); } catch { /* leave as-is */ }
    }
    if (!isFormData) {
      axiosConfig.headers['Content-Type'] = 'application/json';
    }
    // FormData: let Axios set Content-Type with boundary automatically.
  }

  try {
    const res = await http.request(axiosConfig);
    return res.data;
  } catch (error) {
    if (error.response?.status === 401) {
      // Tokens already cleared by the http interceptor.
      if (_onUnauthorized) _onUnauthorized();
      return null;
    }
    const detail = error.response?.data?.detail;
    // FastAPI validation errors come as an array of {loc, msg, type}
    const err = Array.isArray(detail)
      ? new Error(translateApiError('__validation__'))
      : new Error(translateApiError(detail || (error.response?.status ? `Xatolik: ${error.response.status}` : '__network__')));
    // Every failure carries its status, so callers can tell a missing endpoint
    // (404, or a 422 from a path that lands on a different route) from a real failure.
    err.status = error.response?.status;
    throw err;
  }
}
