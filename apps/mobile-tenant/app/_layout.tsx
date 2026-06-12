/**
 * Root stack. Two top-level segments:
 *   - /auth/...   → phone + OTP flow
 *   - /home/...   → signed-in residents
 *
 * `app/index.tsx` synchronously decides which segment to redirect to based
 * on the persisted token loaded into the store at bootstrap.
 */
import { useEffect, useState } from 'react';
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAppStore } from '../lib/store';
import { secureStorage } from '../lib/storage';
import { colors } from '../lib/theme';

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

function AuthGuard() {
  const token = useAppStore((s) => s.accessToken);
  const segments = useSegments();
  const router = useRouter();
  // Same cold-start guard as the staff app — don't router.replace until
  // the Stack is actually mounted.
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    const inAuth = segments[0] === 'auth';
    if (!token && !inAuth) router.replace('/auth/login');
    if (token && inAuth) router.replace('/home');
  }, [token, segments, router, navState?.key]);

  return null;
}

export default function RootLayout() {
  const setSession = useAppStore((s) => s.setSession);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await secureStorage.getAccessToken();
      if (t) setSession(t, null);
      setReady(true);
    })();
  }, [setSession]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthGuard />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="auth" />
              <Stack.Screen name="home" />
            </Stack>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
