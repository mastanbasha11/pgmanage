/**
 * Data-source switch.
 *
 * USE_MOCK defaults TRUE for Phase 1 — the entire app is clickable end-
 * to-end against the seed DB without a live backend. Each domain hook
 * checks `USE_MOCK` and dispatches to either the mock fetcher or the
 * real axios client.
 *
 * Flip at build time:
 *
 *   EXPO_PUBLIC_USE_MOCK=false eas build --profile preview
 *
 * Or at runtime (dev menu — wired in Phase 9):
 *
 *   import { setUseMock } from '@/lib/data/client';
 *   setUseMock(false);
 */
let _useMock = process.env.EXPO_PUBLIC_USE_MOCK !== 'false';

export function useMockEnabled(): boolean {
  return _useMock;
}

export function setUseMock(value: boolean): void {
  _useMock = value;
}
