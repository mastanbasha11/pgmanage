/**
 * Global jest setup. Loaded by the jest-expo preset via setupFiles.
 *
 * Mocks the native modules that throw when required outside a real RN
 * runtime, so pure-logic tests don't need to mock them individually.
 */

// AsyncStorage's native bridge is unavailable in jest; the library ships a
// reference mock for exactly this use case.
jest.mock(
  '@react-native-async-storage/async-storage',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-localization touches a native module on load.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'IN' }],
  getCalendars: () => [],
}));

// expo-secure-store — we use it through lib/storage; mock the surface our
// code calls so tests don't try to hit the Keystore.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// expo-speech is fire-and-forget; stub speak/stop so voice helper doesn't
// pull native into the test bundle.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

// expo-image-picker — only used by the resident detail screen on real
// devices; tests never need a real picker.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
