/**
 * Auth store contract: sign in stores token + profile; sign out clears both.
 * Useful as a smoke test that Zustand wiring isn't broken before we ship.
 */
import { useAppStore } from '../lib/store';

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.getState().signOut();
  });

  it('starts unauthenticated', () => {
    expect(useAppStore.getState().accessToken).toBeNull();
    expect(useAppStore.getState().profile).toBeNull();
  });

  it('setSession populates token and profile', () => {
    useAppStore.getState().setSession('jwt-token', {
      id: 'tenant-1',
      name: 'Asha',
      phone: '+919876543299',
      email: 'a@x.com',
      property_name: 'Test PG',
      room_number: '101',
      bed_label: 'A',
      org_name: 'Test Org',
    });
    expect(useAppStore.getState().accessToken).toBe('jwt-token');
    expect(useAppStore.getState().profile?.name).toBe('Asha');
  });

  it('signOut clears everything', () => {
    useAppStore.getState().setSession('jwt', null);
    useAppStore.getState().signOut();
    expect(useAppStore.getState().accessToken).toBeNull();
    expect(useAppStore.getState().profile).toBeNull();
  });
});
