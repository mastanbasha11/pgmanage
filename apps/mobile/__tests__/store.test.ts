/**
 * Auth + RBAC + preferences store. Locks down:
 *  - canAccessFinancials returns true ONLY for OWNER/PARTNER.
 *  - setAuth pushes both tokens through SecureStore (not AsyncStorage).
 *  - logout clears the SecureStore and the in-memory user.
 *  - setLang flips the i18n locale.
 *
 * Mocks the storage layer + i18n so this test stays a unit test (no real
 * keychain, no real Localization).
 */

const secureCalls: Record<string, unknown[]> = {
  setTokens: [],
  clear: [],
};

jest.mock('../lib/storage', () => ({
  secureStorage: {
    setTokens: jest.fn(async (a: string, r: string) => {
      secureCalls.setTokens.push([a, r]);
    }),
    setAccessToken: jest.fn(),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    clear: jest.fn(async () => {
      secureCalls.clear.push([]);
    }),
  },
  prefStorage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

let lastLocale: string | undefined;
jest.mock('../lib/i18n', () => ({
  setLocale: jest.fn((l: string) => {
    lastLocale = l;
  }),
}));

import { useAppStore } from '../lib/store';

beforeEach(() => {
  // Reset persisted slice between tests so role checks don't bleed across.
  useAppStore.setState({
    user: null,
    selectedPropertyId: null,
    lang: 'en',
    simpleMode: false,
    voiceGuidance: false,
  });
  secureCalls.setTokens = [];
  secureCalls.clear = [];
  lastLocale = undefined;
});

function userWithRole(role: 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR') {
  return {
    user_id: '1',
    org_id: 'o',
    name: 'Test',
    email: 't@t.com',
    role,
    property_ids: null,
  };
}

describe('store — RBAC', () => {
  test('OWNER can access financials', () => {
    useAppStore.setState({ user: userWithRole('OWNER') });
    expect(useAppStore.getState().canAccessFinancials()).toBe(true);
  });

  test('PARTNER can access financials', () => {
    useAppStore.setState({ user: userWithRole('PARTNER') });
    expect(useAppStore.getState().canAccessFinancials()).toBe(true);
  });

  test('PROPERTY_MANAGER cannot access financials', () => {
    useAppStore.setState({ user: userWithRole('PROPERTY_MANAGER') });
    expect(useAppStore.getState().canAccessFinancials()).toBe(false);
  });

  test('SUPERVISOR cannot access financials', () => {
    useAppStore.setState({ user: userWithRole('SUPERVISOR') });
    expect(useAppStore.getState().canAccessFinancials()).toBe(false);
  });

  test('signed-out user cannot access financials', () => {
    useAppStore.setState({ user: null });
    expect(useAppStore.getState().canAccessFinancials()).toBe(false);
  });
});

describe('store — auth flow', () => {
  test('setAuth writes tokens to SecureStore and sets the user', async () => {
    await useAppStore.getState().setAuth(userWithRole('OWNER'), 'access-1', 'refresh-1');
    expect(secureCalls.setTokens).toEqual([['access-1', 'refresh-1']]);
    expect(useAppStore.getState().user?.role).toBe('OWNER');
  });

  test('logout clears SecureStore and resets in-memory user', async () => {
    await useAppStore.getState().setAuth(userWithRole('OWNER'), 'a', 'r');
    await useAppStore.getState().logout();
    expect(secureCalls.clear.length).toBe(1);
    expect(useAppStore.getState().user).toBeNull();
    expect(useAppStore.getState().selectedPropertyId).toBeNull();
  });
});

describe('store — preferences', () => {
  test('setLang updates the store and re-applies the i18n locale', () => {
    useAppStore.getState().setLang('hi');
    expect(useAppStore.getState().lang).toBe('hi');
    expect(lastLocale).toBe('hi');
  });

  test('setSimpleMode + setVoiceGuidance flip flags independently', () => {
    useAppStore.getState().setSimpleMode(true);
    useAppStore.getState().setVoiceGuidance(true);
    expect(useAppStore.getState().simpleMode).toBe(true);
    expect(useAppStore.getState().voiceGuidance).toBe(true);
    useAppStore.getState().setSimpleMode(false);
    expect(useAppStore.getState().simpleMode).toBe(false);
    expect(useAppStore.getState().voiceGuidance).toBe(true);
  });

  test('setSelectedProperty updates the active property id', () => {
    useAppStore.getState().setSelectedProperty('prop-42');
    expect(useAppStore.getState().selectedPropertyId).toBe('prop-42');
  });
});
