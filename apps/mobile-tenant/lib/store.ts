/**
 * Tenant-app auth store.
 *
 * Persists nothing in-memory across cold starts — the source of truth on
 * launch is the access token in SecureStore. The root `app/index.tsx`
 * reads the token synchronously (well, after a tiny bootstrap effect) and
 * routes to /auth/login or /home.
 *
 * "Profile" (the tenant's name + org + property) is fetched from
 * /tenant/me right after sign-in; we cache it here so /home doesn't have
 * to wait on the network to greet the user.
 */
import { create } from 'zustand';

export interface TenantProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  property_name?: string | null;
  room_number?: string | null;
  bed_label?: string | null;
  org_name?: string | null;
}

interface AppState {
  accessToken: string | null;
  profile: TenantProfile | null;
  setSession: (token: string, profile?: TenantProfile | null) => void;
  setProfile: (profile: TenantProfile | null) => void;
  signOut: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  accessToken: null,
  profile: null,
  setSession: (token, profile = null) => set({ accessToken: token, profile }),
  setProfile: (profile) => set({ profile }),
  signOut: () => set({ accessToken: null, profile: null }),
}));
