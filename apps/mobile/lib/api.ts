/**
 * Owner/staff API client.
 *
 * Two interceptors do the lifting:
 *  1. Request: attach `Bearer <access_token>` from SecureStore.
 *  2. Response: on 401, try one silent refresh against /auth/refresh and
 *     replay the original request. If the refresh itself 401s we clear
 *     tokens and let the caller redirect to login (handled by store).
 *
 * The tenant-portal client (`tenantApi`) is unchanged from the v0 scaffold
 * because the tenant flow lives behind a separate audience / token.
 */
import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { secureStorage } from './storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://pgmanage.in/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await secureStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single in-flight refresh promise — all 401s while a refresh is mid-flight
// await the same call, so we never hammer the refresh endpoint.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refresh = await secureStorage.getRefreshToken();
      if (!refresh) return null;
      const res = await axios.post<{ access_token: string; refresh_token?: string }>(
        `${BASE_URL}/auth/refresh`,
        { refresh_token: refresh },
        { timeout: 10_000 },
      );
      const newAccess = res.data.access_token;
      const newRefresh = res.data.refresh_token ?? refresh;
      await secureStorage.setTokens(newAccess, newRefresh);
      return newAccess;
    } catch {
      await secureStorage.clear();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;
      const fresh = await refreshAccessToken();
      if (fresh) {
        original.headers!.Authorization = `Bearer ${fresh}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

// ── Tenant portal (separate audience) ────────────────────────────────────────

export const tenantApi = axios.create({
  baseURL: `${BASE_URL}/tenant`,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

tenantApi.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem('tenant_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    return data?.error?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

/** Idempotency-Key for payment writes. Avoids the `uuid` dep that needs a
 *  crypto polyfill in React Native. */
export function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Helper used by mutations that must be idempotent (payments). */
export function withIdempotency(config?: AxiosRequestConfig): AxiosRequestConfig {
  return {
    ...config,
    headers: { ...(config?.headers ?? {}), 'X-Idempotency-Key': newIdempotencyKey() },
  };
}
