/**
 * Helpers exported from lib/api. The axios client itself isn't unit-tested
 * here (that's an integration concern against the real backend); we cover
 * the pure helpers:
 *   - getApiError handles every error shape we observed in the wild.
 *   - newIdempotencyKey gives unique-enough strings.
 *   - withIdempotency attaches the header without dropping existing ones.
 */
import axios from 'axios';

// SecureStore is imported transitively through lib/api; mock it so jest
// doesn't try to spin up the native module.
jest.mock('../lib/storage', () => ({
  secureStorage: {
    getAccessToken: jest.fn(async () => null),
    getRefreshToken: jest.fn(async () => null),
    setTokens: jest.fn(),
    clear: jest.fn(),
  },
}));

import { getApiError, newIdempotencyKey, withIdempotency } from '../lib/api';

describe('getApiError', () => {
  test('reads the backend error envelope when axios sets it', () => {
    const fakeErr = {
      isAxiosError: true,
      response: { data: { error: { code: 'CONFLICT', message: 'Bed is occupied' } } },
      message: 'Request failed with status code 409',
    };
    // axios.isAxiosError reads a marker — force it to true for the fake.
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);
    expect(getApiError(fakeErr)).toBe('Bed is occupied');
  });

  test('falls back to axios .message when no error envelope is present', () => {
    const fakeErr = { isAxiosError: true, message: 'Network Error' };
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);
    expect(getApiError(fakeErr)).toBe('Network Error');
  });

  test('returns the .message from a plain Error', () => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);
    expect(getApiError(new Error('boom'))).toBe('boom');
  });

  test('returns a generic string for unknown error shapes', () => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);
    expect(getApiError({ weird: true })).toBe('An unexpected error occurred');
    expect(getApiError(undefined)).toBe('An unexpected error occurred');
    expect(getApiError(null)).toBe('An unexpected error occurred');
  });
});

describe('newIdempotencyKey', () => {
  test('returns a non-empty string', () => {
    const k = newIdempotencyKey();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(8);
  });

  test('two consecutive calls return different keys', () => {
    // Random part ensures uniqueness even when timestamps collide on fast
    // calls (RN's Hermes resolution can be <1ms apart).
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toEqual(b);
  });
});

describe('withIdempotency', () => {
  test('returns a config with the X-Idempotency-Key header set', () => {
    const cfg = withIdempotency();
    expect(cfg.headers).toBeDefined();
    const headers = cfg.headers as Record<string, string>;
    expect(headers['X-Idempotency-Key']).toMatch(/.+/);
  });

  test('preserves any pre-existing headers passed in', () => {
    const cfg = withIdempotency({ headers: { 'X-Trace-Id': 't-1' } });
    const headers = cfg.headers as Record<string, string>;
    expect(headers['X-Trace-Id']).toBe('t-1');
    expect(headers['X-Idempotency-Key']).toBeTruthy();
  });
});
