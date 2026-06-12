/**
 * Storage helpers for the Resident app.
 *
 * Tokens live in expo-secure-store (Keychain / Android Keystore). Keys are
 * deliberately distinct from the staff app's `pgm.*` keys so installing
 * both apps on the same device doesn't cause one to read the other's token
 * (different audiences — would fail validation anyway, but avoiding it
 * cleanly is nicer).
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEYS = {
  accessToken: 'pgm_res.access_token',
} as const;

const PREF_KEYS = {
  language: 'pgm_res.language',
  identityPhone: 'pgm_res.identity_phone',
} as const;

export const secureStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(SECURE_KEYS.accessToken);
  },
  async setAccessToken(token: string) {
    await SecureStore.setItemAsync(SECURE_KEYS.accessToken, token);
  },
  async clear() {
    await SecureStore.deleteItemAsync(SECURE_KEYS.accessToken);
  },
};

export const prefStorage = {
  async getLanguage() {
    return AsyncStorage.getItem(PREF_KEYS.language);
  },
  async setLanguage(lang: string) {
    await AsyncStorage.setItem(PREF_KEYS.language, lang);
  },
  async getIdentityPhone() {
    return AsyncStorage.getItem(PREF_KEYS.identityPhone);
  },
  async setIdentityPhone(phone: string) {
    await AsyncStorage.setItem(PREF_KEYS.identityPhone, phone);
  },
  async clear() {
    await Promise.all([
      AsyncStorage.removeItem(PREF_KEYS.language),
      AsyncStorage.removeItem(PREF_KEYS.identityPhone),
    ]);
  },
};
