/**
 * Pure API helper tests — no network. Covers:
 *  - getApiError unwraps the backend's structured error envelope.
 *  - isMultiOrg correctly discriminates the verify response shapes.
 */
import { getApiError, isMultiOrg, OtpVerifyResponse } from '../lib/api';

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
