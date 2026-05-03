import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Role = 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR';

export interface AuthUser {
  user_id: string;
  org_id: string;
  name: string;
  email: string;
  role: Role;
  property_ids: string[] | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  selectedPropertyId: string | null;

  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  setSelectedProperty: (id: string) => void;
  canAccessFinancials: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      selectedPropertyId: null,

      setAuth: (user, token) => {
        set({ user, accessToken: token });
      },

      logout: () => {
        AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        set({ user: null, accessToken: null, selectedPropertyId: null });
      },

      setSelectedProperty: (id) => set({ selectedPropertyId: id }),

      canAccessFinancials: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'PARTNER';
      },
    }),
    {
      name: 'pgmanage-auth-mobile',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
