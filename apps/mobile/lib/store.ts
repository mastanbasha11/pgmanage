/**
 * Owner/staff state store.
 *
 * Three slices:
 *  - Auth: user + selectedPropertyId (persisted to AsyncStorage; tokens
 *    themselves live in SecureStore via lib/storage.ts).
 *  - Preferences: language (en/hi/te), simple-mode flag, voice-guidance flag.
 *
 * Tokens are passed through the storage helper rather than living in the
 * store, so a SQL-injection / XSS-like RN exploit reading the JSON store
 * never gets the bearer token.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { secureStorage } from './storage';
import { setLocale, type Lang } from './i18n';

export type Role = 'OWNER' | 'PARTNER' | 'PROPERTY_MANAGER' | 'SUPERVISOR';

export interface AuthUser {
  user_id: string;
  org_id: string;
  name: string;
  email: string;
  role: Role;
  property_ids: string[] | null;
}

interface AppState {
  // auth
  user: AuthUser | null;
  selectedPropertyId: string | null;

  // preferences
  lang: Lang;
  simpleMode: boolean;
  voiceGuidance: boolean;

  setAuth: (user: AuthUser, access: string, refresh: string) => Promise<void>;
  setSelectedProperty: (id: string) => void;
  setLang: (lang: Lang) => void;
  setSimpleMode: (on: boolean) => void;
  setVoiceGuidance: (on: boolean) => void;
  logout: () => Promise<void>;
  canAccessFinancials: () => boolean;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      selectedPropertyId: null,
      lang: 'en',
      simpleMode: false,
      voiceGuidance: false,

      setAuth: async (user, access, refresh) => {
        await secureStorage.setTokens(access, refresh);
        set({ user });
      },

      setSelectedProperty: (id) => set({ selectedPropertyId: id }),

      setLang: (lang) => {
        setLocale(lang);
        set({ lang });
      },
      setSimpleMode: (on) => set({ simpleMode: on }),
      setVoiceGuidance: (on) => set({ voiceGuidance: on }),

      logout: async () => {
        await secureStorage.clear();
        set({ user: null, selectedPropertyId: null });
      },

      canAccessFinancials: () => {
        const role = get().user?.role;
        return role === 'OWNER' || role === 'PARTNER';
      },
    }),
    {
      name: 'pgmanage-app',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist transient fields; everything in this state is fine to persist.
      partialize: (s) => ({
        user: s.user,
        selectedPropertyId: s.selectedPropertyId,
        lang: s.lang,
        simpleMode: s.simpleMode,
        voiceGuidance: s.voiceGuidance,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-apply locale when the store rehydrates so the first render
        // already speaks the chosen language.
        if (state?.lang) setLocale(state.lang);
      },
    },
  ),
);

// Backward-compat name for any screens still importing the old hook.
export const useAuthStore = useAppStore;
