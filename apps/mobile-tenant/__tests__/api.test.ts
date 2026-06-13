/**
 * Pure API helper tests — no network. Covers:
 *  - getApiError unwraps the backend's structured error envelope.
 *  - isMultiOrg correctly discriminates the verify response shapes.
 */
import { getApiError, isMultiOrg, OtpRequestResponse, OtpVerifyResponse } from '../lib/api';

describe('getApiError', () => {
  it('extracts message from backend envelope', () => {
    const err = {
      isAxiosError: true,
      response: { data: { error: { code: 'X', message: 'Boom' } } },
      message: 'fallback',
    };
    // Mimic axios.isAxiosError check by exposing isAxiosError = true
    expect(getApiError(err as unknown)).toBe('Boom');
  });

  it('falls back to axios .message when envelope is missing', () => {
    const err = {
      isAxiosError: true,
      response: { data: {} },
      message: 'Network Error',
    };
    expect(getApiError(err as unknown)).toBe('Network Error');
  });

  it('handles non-axios errors gracefully', () => {
    expect(getApiError(new Error('local'))).toContain('Something went wrong');
  });
});

describe('OtpRequestResponse shapes', () => {
  // The compiler should accept all three shapes; if a backend change drops
  // a field this test starts failing at TS compile, which is the alarm.
  it('accepts inline shape (code present)', () => {
    const r: OtpRequestResponse = {
      delivery: 'inline',
      code: '123456',
      to: 'a••@x.com',
      email_delivered: false,
      expires_in: 600,
      notice: 'Test mode',
    };
    expect(r.code).toBe('123456');
  });

  it('accepts email shape (no code)', () => {
    const r: OtpRequestResponse = {
      delivery: 'email',
      to: 'a••@x.com',
      expires_in: 600,
    };
    expect(r.delivery).toBe('email');
    expect(r.code).toBeUndefined();
  });

  it('accepts none shape (unknown phone)', () => {
    const r: OtpRequestResponse = {
      delivery: 'none',
      expires_in: 600,
    };
    expect(r.code).toBeUndefined();
    expect(r.to).toBeUndefined();
  });
});

describe('isMultiOrg', () => {
  it('returns true only when needs_org_pick === true', () => {
    const single: OtpVerifyResponse = {
      access_token: 'x',
      token_type: 'bearer',
      org: { id: 'o', name: 'PG', slug: 'pg' },
    };
    expect(isMultiOrg(single)).toBe(false);

    const multi: OtpVerifyResponse = {
      needs_org_pick: true,
      ticket: 't',
      orgs: [{ id: 'a', name: 'A', slug: 'a' }],
    };
    expect(isMultiOrg(multi)).toBe(true);
  });
});
