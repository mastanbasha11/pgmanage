/**
 * Mocks for native modules so pure-logic tests run without a device.
 * Mirror of apps/mobile/jest.setup.ts minus the modules we don't use
 * (speech, image-picker — owner-staff features).
 */
jest.mock(
  '@react-native-async-storage/async-storage',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'IN' }],
  getCalendars: () => [],
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
