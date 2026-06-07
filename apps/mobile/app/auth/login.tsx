/**
 * Sign-in screen. Email + password against /auth/login.
 *
 * On success:
 *   1. Tokens go to SecureStore via setAuth.
 *   2. We fetch /properties and auto-select the first one so the data tabs
 *      have a property context to query against (mirrors the web Layout).
 *   3. Route to /tabs (Dashboard).
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { api, getApiError } from '../../lib/api';
import { useAppStore, AuthUser } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { Button, Field, Screen } from '../../components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const { setAuth, setSelectedProperty } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{
        access_token: string;
        refresh_token: string;
        user: AuthUser;
      }>('/auth/login', { email, password });
      await setAuth(res.data.user, res.data.access_token, res.data.refresh_token);
      try {
        const props = await api.get<{ items: { id: string }[] }>('/properties');
        const first = props.data?.items?.[0]?.id;
        if (first) setSelectedProperty(first);
      } catch {
        /* non-fatal */
      }
      router.replace('/tabs');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.title}>PGManage</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          {/* Form */}
          <View style={styles.form}>
            <Field
              label={t('common.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="owner@mypg.com"
            />
            <Field
              label={t('common.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              variant="primary"
              label={t('common.signin')}
              onPress={handleLogin}
              loading={loading}
              block
              iconName="log-in-outline"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  logoText: { color: colors.accent, fontSize: 32, fontWeight: '800' },
  title: { fontSize: fontSize.h1, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: space.xl },
  form: { width: '100%', maxWidth: 360, gap: space.sm },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
