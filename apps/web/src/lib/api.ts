import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// Attach JWT from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → clear auth and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      // Avoid redirect loops on the login/auth pages
      if (!window.location.pathname.startsWith('/auth') &&
          !window.location.pathname.startsWith('/tenant')) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);

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
    const data = error.response?.data as ApiError | undefined;
    return data?.error?.message ?? error.message;
  }
  return 'An unexpected error occurred';
}
