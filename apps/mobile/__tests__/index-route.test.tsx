/**
 * Catches the EXACT cold-start bug the user reported on build 00d3616:
 * tapping the home-screen icon launched the app with URL pgmanage:///
 * and there was no app/index.tsx, so expo-router showed "Unmatched Route".
 *
 * The fix added app/index.tsx with a <Redirect> that synchronously routes
 * based on auth state. These tests lock that behaviour down.
 *
 * Note: we don't actually render with the full Stack — that would pull in
 * native navigation modules. We import Index, mock the store, mock the
 * Redirect component, and assert what href is being requested.
 */
import { render } from '@testing-library/react-native';

// Stub Redirect so we can read the href it was called with. The runtime
// component throws if it's not inside an expo-router context, but we only
// care about the props the test passed in. Use require() inside the
// factory — jest.mock factories can't reference module-scope imports.
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: 'redirect-href' }, href),
  };
});

// Mock the store so we can flip the user value per-test.
jest.mock('../lib/store', () => ({
  useAppStore: jest.fn(),
}));

import Index from '../app/index';
import { useAppStore } from '../lib/store';

describe('app/index.tsx — root redirect', () => {
  test('signed-out user is redirected to /auth/login', () => {
    (useAppStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ user: null }),
    );
    const tree = render(<Index />);
    expect(tree.getByTestId('redirect-href').props.children).toBe('/auth/login');
  });

  test('signed-in user is redirected to /tabs', () => {
    (useAppStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ user: { user_id: '1', org_id: 'o', name: 'X', email: 'x@y', role: 'OWNER', property_ids: null } }),
    );
    const tree = render(<Index />);
    expect(tree.getByTestId('redirect-href').props.children).toBe('/tabs');
  });

  test('redirect renders synchronously (no async waiting required)', () => {
    (useAppStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ user: null }),
    );
    const tree = render(<Index />);
    // If this passes without `await waitFor`, the redirect is happening on
    // first render — exactly what we need for cold-start before the
    // sitemap-fallback can paint.
    expect(tree.getByTestId('redirect-href')).toBeTruthy();
  });
});
