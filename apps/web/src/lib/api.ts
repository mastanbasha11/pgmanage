import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ── Inactivity tracking ──────────────────────────────────────────────────────
// We log the user out only after 4 hours of no interaction, not just because
// the JWT expired. Any keypress / click / scroll / touch resets the clock.

const ACTIVITY_KEY = 'last_activity';
const INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours

function markActive(): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function isIdle(): boolean {
  const raw = localStorage.getItem(ACTIVITY_KEY);
  if (!raw) return false; // no recorded activity yet → don't punish
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last > INACTIVITY_LIMIT_MS;
}

function clearAuthAndRedirect(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem(ACTIVITY_KEY);
  if (
    !window.location.pathname.startsWith('/auth') &&
    !window.location.pathname.startsWith('/portal')
  ) {
    window.location.href = '/auth/login';
  }
}

if (typeof window !== 'undefined') {
  // Seed on load so the very first request doesn't look idle.
  if (!localStorage.getItem(ACTIVITY_KEY)) markActive();

  const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
  let lastWrite = 0;
  const bump = () => {
    const now = Date.now();
    if (now - lastWrite < 5_000) return; // throttle to once / 5s
    lastWrite = now;
    markActive();
  };
  for (const ev of events) {
    window.addEventListener(ev, bump, { passive: true });
  }
  document.addEventListener('visibilitychange', bump);

  // Periodic idle check — if user came back after 4h+ without any keystroke,
  // log them out even if no API call has fired yet.
  setInterval(() => {
    if (localStorage.getItem('access_token') && isIdle()) {
      clearAuthAndRedirect();
    }
  }, 60_000);
}

// ── Token refresh (shared singleton promise) ─────────────────────────────────

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      // Use raw axios to avoid our own interceptor recursing on this call.
      const res = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>('/api/v1/auth/refresh', { refresh_token: refreshToken });
      const access = res.data.access_token;
      const refresh = res.data.refresh_token;
      if (access) localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
      return access ?? null;
    } catch {
      return null;
    } finally {
      // Allow another refresh attempt on the next 401.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

// ── Owner / staff API ────────────────────────────────────────────────────────

// Attach JWT
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // If we're past the idle threshold, kick the user out before even firing
  // the request. Cheap and avoids the wasted round-trip.
  if (isIdle()) {
    clearAuthAndRedirect();
    return Promise.reject(new axios.Cancel('Session expired (inactivity)'));
  }
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → try refresh, replay original; otherwise clear auth + redirect.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = (error.config ?? {}) as AxiosRequestConfig & {
      _retry?: boolean;
      url?: string;
    };

    // Don't try to refresh if the failing call IS the refresh itself, or if
    // we've already retried once for this request.
    const isAuthCall =
      typeof original.url === 'string' &&
      (original.url.includes('/auth/refresh') ||
        original.url.includes('/auth/login') ||
        original.url.includes('/auth/signup'));

    if (status === 401 && !isAuthCall && !original._retry) {
      original._retry = true;

      // If the user has been idle past the cutoff, don't try to refresh —
      // genuine "your session expired" case.
      if (isIdle()) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      const newAccess = await refreshAccessToken();
      if (newAccess) {
        original.headers = {
          ...(original.headers ?? {}),
          Authorization: `Bearer ${newAccess}`,
        };
        return api.request(original);
      }
      clearAuthAndRedirect();
    } else if (status === 401) {
      clearAuthAndRedirect();
    }
    return Promise.reject(error);
  },
);

// ── Tenant portal API ────────────────────────────────────────────────────────

export const tenantApi = axios.create({
  baseURL: '/api/v1/tenant',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

tenantApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('tenant_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

tenantApi.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tenant_access_token');
      window.location.href = '/portal/login';
    }
    return Promise.reject(error);
  },
);

// Typed API error
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { message?: string }; detail?: { error?: { message?: string } | string } | string }
      | undefined;
    // FastAPI's HTTPException(detail={"error": {...}}) ends up nested under `detail`
    const nested =
      typeof data?.detail === 'object' && data.detail !== null && 'error' in data.detail
        ? (data.detail as { error: { message?: string } }).error?.message
        : typeof data?.detail === 'string'
        ? data.detail
        : undefined;
    return data?.error?.message ?? nested ?? error.message;
  }
  return 'An unexpected error occurred';
}
