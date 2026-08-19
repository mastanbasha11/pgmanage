/**
 * Resident-app API client.
 *
 * No refresh-token dance — the tenant JWT is long-lived (issued at /verify
 * and only invalidated by a server-side checkout, in which case the next
 * call returns 401 and we route back to the OTP screen).
 *
 * Auth endpoints (no token required):
 *   POST /tenant/auth/otp        { phone }
 *   POST /tenant/auth/verify     { phone, code }
 *   POST /tenant/auth/select-org { ticket, org_id }
 *
 * Tenant-scoped endpoints (Bearer token required, audience = TENANT):
 *   GET  /tenant/me
 *   GET  /tenant/ledger
 *   GET  /tenant/complaints
 *   POST /tenant/complaints
 *   GET  /tenant/announcements
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { secureStorage } from './storage';
import { useAppStore } from './store';

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

// On a 401 for an AUTHENTICATED request the token has expired/been revoked.
// Drop the session so the root layout bounces to the login screen — otherwise
// every query keeps failing and the app hangs on its loading state ("white
// screen") until a manual sign-out + re-login. (Login-flow 401s carry no token
// and are left to propagate as normal validation errors.)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const hadAuth = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadAuth) {
      await secureStorage.clear();
      useAppStore.getState().signOut();
    }
    return Promise.reject(error);
  },
);

/** Extract a user-readable message out of a backend error envelope. */
export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = (err as AxiosError<{ error?: { message?: string; code?: string } }>).response
      ?.data;
    if (data?.error?.message) return data.error.message;
    if (err.message) return err.message;
  }
  return 'Something went wrong. Please try again.';
}

// ── Typed request helpers (V1 surface only) ─────────────────────────────────

export interface OtpRequestResponse {
  /**
   *  - 'inline' (pre-WhatsApp/SMS, current default): backend includes
   *    `code` in the response so the app can show it on-screen and
   *    prefill the OTP input.
   *  - 'email':  backend emailed the code; UI prompts user to check inbox.
   *  - 'none':   phone isn't registered (response shape is identical to a
   *    success to prevent enumeration); UI proceeds to the code screen and
   *    /verify will return 401.
   */
  delivery: 'inline' | 'email' | 'none';
  /** Present only when delivery=inline. The literal 6-digit OTP. */
  code?: string;
  /** Masked email — present when an email is on file (inline or email mode). */
  to?: string | null;
  /** Whether the best-effort email send succeeded (inline mode only). */
  email_delivered?: boolean;
  /** Optional human-readable banner string from the server. */
  notice?: string;
  expires_in: number;
}

export interface OtpVerifyResponseSingleOrg {
  access_token: string;
  token_type: 'bearer';
  org: { id: string; name: string; slug: string };
}

export interface OtpVerifyResponseMultiOrg {
  needs_org_pick: true;
  ticket: string;
  orgs: { id: string; name: string; slug: string }[];
}

export type OtpVerifyResponse = OtpVerifyResponseSingleOrg | OtpVerifyResponseMultiOrg;

export function isMultiOrg(r: OtpVerifyResponse): r is OtpVerifyResponseMultiOrg {
  return (r as OtpVerifyResponseMultiOrg).needs_org_pick === true;
}

export async function requestOtp(phone: string): Promise<OtpRequestResponse> {
  const r = await api.post<OtpRequestResponse>('/tenant/auth/otp', { phone });
  return r.data;
}

export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResponse> {
  const r = await api.post<OtpVerifyResponse>('/tenant/auth/verify', { phone, code });
  return r.data;
}

export async function selectOrg(ticket: string, orgId: string): Promise<OtpVerifyResponseSingleOrg> {
  const r = await api.post<OtpVerifyResponseSingleOrg>('/tenant/auth/select-org', {
    ticket,
    org_id: orgId,
  });
  return r.data;
}
