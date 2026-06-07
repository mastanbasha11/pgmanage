/**
 * Root stack. Three top-level segments:
 *   - /auth/...          → public (login)
 *   - /tabs/...          → owner/staff app (auth gated)
 *   - /tenant-portal/... → tenant OTP flow (separate token, kept from v0)
 *
 * AuthGuard checks the persisted Zustand user — token itself lives in
 * SecureStore but the user record is a fine proxy for "signed-in".
 */
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppStore } from '../lib/store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
    },
  },
});

// Refetch active queries when the app comes to the foreground.
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

function AuthGuard() {
  const user = useAppStore((s) => s.user);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuth = segments[0] === 'auth';
    const inPortal = segments[0] === 'tenant-portal';
    if (!user && !inAuth && !inPortal) router.replace('/auth/login');
    if (user && inAuth) router.replace('/tabs');
  }, [user, segments, router]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGuard />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="auth" />
            <Stack.Screen name="tabs" />
            <Stack.Screen name="tenant-portal" />
            <Stack.Screen name="residents/[id]" />
            <Stack.Screen name="payments/new" options={{ presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
