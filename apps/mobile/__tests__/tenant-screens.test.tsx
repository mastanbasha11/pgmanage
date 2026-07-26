/**
 * Smoke tests: the resident screens must mount with EMPTY/undefined data
 * (cold start, before the API responds) without crashing and without ever
 * rendering "NaN". This is the guard against the ₹NaN class of bug and against
 * a screen breaking on first paint.
 */
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// WebView is a native module — stub it (checkout modal is closed in these tests).
jest.mock('react-native-webview', () => ({ WebView: () => null }));

// Empty-data hooks — the worst case for NaN / undefined rendering.
jest.mock('../lib/tenant/hooks', () => ({
  useTenantProfile: () => ({ data: undefined, isLoading: false }),
  useTenantDues: () => ({ data: undefined, isLoading: false }),
  useTenantNotices: () => ({ data: [] }),
  useTenantTickets: () => ({ data: [] }),
  useTenantPayments: () => ({ data: [] }),
  useTenantPaymentConfig: () => ({ data: { enabled: false } }),
  useTenantDepositInfo: () => ({ data: undefined }),
  useTenantGiveNotice: () => ({ mutate: jest.fn(), isPending: false }),
  useTenantReferralSummary: () => ({ data: null }),
  useTenantCurrentMenu: () => ({ data: null, isLoading: false }),
  useCreateTenantOrder: () => ({ mutate: jest.fn(), isPending: false }),
  useVerifyTenantPayment: () => ({ mutate: jest.fn() }),
  useRaiseComplaint: () => ({ mutate: jest.fn(), isPending: false }),
}));

import TenantHome from '../app/tenant-portal/(tabs)/home';
import TenantPay from '../app/tenant-portal/(tabs)/pay';
import TenantStay from '../app/tenant-portal/(tabs)/stay';
import TenantMore from '../app/tenant-portal/(tabs)/more';
import TenantFood from '../app/tenant-portal/(tabs)/food';
import TenantMoveOut from '../app/tenant-portal/moveout';
import TenantRequests from '../app/tenant-portal/requests';

const screens: [string, React.ComponentType][] = [
  ['Home', TenantHome],
  ['Pay', TenantPay],
  ['Stay', TenantStay],
  ['More', TenantMore],
  ['Food', TenantFood],
  ['MoveOut', TenantMoveOut],
  ['Requests', TenantRequests],
];

describe('resident screens mount safely with empty data', () => {
  it.each(screens)('%s renders without crashing and shows no NaN', (_name, Screen) => {
    const tree = render(<Screen />);
    // Case-sensitive: JS renders the bad value as exactly "NaN" / "undefined".
    // (Avoid /i — it false-matches "mainte·nan·ce" etc.)
    expect(tree.queryAllByText(/NaN/).length).toBe(0);
    expect(tree.queryAllByText(/undefined/).length).toBe(0);
  });

  it('Home shows ₹0 (not ₹NaN) when dues are unloaded', () => {
    const tree = render(<TenantHome />);
    expect(tree.getAllByText('₹0').length).toBeGreaterThan(0);
  });
});
