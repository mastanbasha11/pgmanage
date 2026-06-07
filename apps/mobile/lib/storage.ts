/**
 * Storage helpers — two tiers:
 *  - secureStorage: tokens. Backed by expo-secure-store (Keychain on iOS,
 *    EncryptedSharedPreferences via the Android Keystore). NEVER use
 *    AsyncStorage for tokens; on Android it's plaintext.
 *  - prefStorage: user prefs (language, simple-mode, last property id, etc.)
 *    These are non-secret and can stay in AsyncStorage for speed +
 *    cross-process readability.
 *
 * Both surfaces expose the same async tiny interface so callers don't care
 * which backend is used.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEYS = {
  accessToken: 'pgm.access_token',
  refreshToken: 'pgm.refresh_token',
} as const;

export const secureStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(SECURE_KEYS.accessToken);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(SECURE_KEYS.refreshToken);
  },
  async setTokens(access: string, refresh: string) {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEYS.accessToken, access),
      SecureStore.setItemAsync(SECURE_KEYS.refreshToken, refresh),
    ]);
  },
  async setAccessToken(access: string) {
    await SecureStore.setItemAsync(SECURE_KEYS.accessToken, access);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_KEYS.accessToken),
      SecureStore.deleteItemAsync(SECURE_KEYS.refreshToken),
    ]);
  },
};

export const prefStorage = {
  get: AsyncStorage.getItem,
  set: AsyncStorage.setItem,
  remove: AsyncStorage.removeItem,
};
