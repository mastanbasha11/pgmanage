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
  delivery: 'email' | 'none';
  to?: string;
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
