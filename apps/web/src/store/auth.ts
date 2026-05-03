import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type Role = 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR';

export interface AuthUser {
  user_id: string;
  org_id: string;
  name: string;
  email: string;
  role: Role;
  property_ids: string[] | null; // null = all properties
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  selectedPropertyId: string | null;

  setAuth: (user: AuthUser, access: string, refresh: string) => void;
  logout: () => void;
  setSelectedProperty: (id: string) => void;

  canAccessFinancials: () => boolean;
  canApproveExpenses: () => boolean;
  canManageStaff: () => boolean;
  hasPropertyAccess: (propertyId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      selectedPropertyId: null,

      setAuth: (user, access, refresh) => {
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);
        set({ user, accessToken: access, refreshToken: refresh });
      },

      logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, accessToken: null, refreshToken: null, selectedPropertyId: null });
      },

      setSelectedProperty: (id) => set({ selectedPropertyId: id }),

      canAccessFinancials: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'PARTNER';
      },

      canApproveExpenses: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'PARTNER';
      },

      canManageStaff: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'PARTNER';
      },

      hasPropertyAccess: (propertyId) => {
        const user = get().user;
        if (!user) return false;
        if (user.property_ids === null) return true; // OWNER/PARTNER
        return user.property_ids.includes(propertyId);
      },
    }),
    {
      name: 'pgmanage-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        selectedPropertyId: state.selectedPropertyId,
      }),
    },
  ),
);

// Fetch current user from API (called on app init / token refresh)
export async function loadCurrentUser(): Promise<void> {
  try {
    const res = await api.get<{ user: AuthUser }>('/auth/me');
    const stored = useAuthStore.getState();
    if (stored.accessToken) {
      useAuthStore.getState().setAuth(
        res.data.user,
        stored.accessToken,
        stored.refreshToken ?? '',
      );
    }
  } catch {
    useAuthStore.getState().logout();
  }
}
