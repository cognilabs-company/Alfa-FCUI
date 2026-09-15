import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { tokenStore } from './token';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api.alpha.cognilabs.org').replace(/\/$/, '');

type RetryableConfig = AxiosRequestConfig & { _retry?: boolean };

let refreshPromise: Promise<void> | null = null;

async function refreshTokens(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token');

    // same-origin proxy (Vite dev proxy / Vercel rewrite): no CORS dependency
    const res = await axios.post<{ access_token: string; refresh_token: string }>(
      '/api/auth/refresh',
      { refresh_token: refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );

    tokenStore.setTokens(res.data.access_token, res.data.refresh_token);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export const http = axios.create({
  baseURL: '/api',
  headers: {
    Accept: 'application/json',
  },
});

http.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = (error.config || {}) as RetryableConfig;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshTokens();
        return http.request(originalRequest);
      } catch {
        tokenStore.clearTokens();
      }
    }

    return Promise.reject(error);
  },
);
