/**
 * Theme preference store.
 *
 * Three modes:
 *   - 'system' (default): follow the OS appearance setting via Appearance API.
 *   - 'light'  / 'dark':  explicit user override.
 *
 * Persisted to AsyncStorage so the choice survives cold starts. We DON'T
 * persist the resolved scheme — only the preference — so a user who set
 * 'system' last week sees the right thing if they since toggled the OS.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pgm_res.theme';

interface ThemeStore {
  /** What the user picked (the preference). */
  preference: ThemePreference;
  /** True once we've read the persisted value at boot — guards a flicker. */
  hydrated: boolean;
  setPreference: (pref: ThemePreference) => void;
  _hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: 'system',
  hydrated: false,
  setPreference: (pref) => {
    set({ preference: pref });
    // Fire-and-forget; persistence failures shouldn't block the UI swap.
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  },
  _hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw === 'system' || raw === 'light' || raw === 'dark') {
        set({ preference: raw, hydrated: true });
        return;
      }
    } catch {
      // ignore — fall through to default
    }
    set({ hydrated: true });
  },
}));
