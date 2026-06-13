/**
 * Step 2 of sign-in: enter the 6-digit code.
 *
 * On success:
 *   - Single-org tenant → token saved to SecureStore + setSession → router
 *     replaces to /home.
 *   - Multi-org tenant → forward to /auth/select-org with the ticket +
 *     org list as params.
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';

import { Button, Field, Screen } from '../../components/ui';
import { isMultiOrg, verifyOtp, requestOtp, getApiError } from '../../lib/api';
import { secureStorage } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

export default function CodeScreen() {
  const params = useLocalSearchParams<{
    phone: string;
    to?: string;
    delivery?: string;
    inlineCode?: string;
    notice?: string;
  }>();
  const { phone, to } = params;
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);

  // When the backend returns a code inline (pre-SMS test mode), pre-fill
  // the input so the user can just tap Verify. We also show the code in
  // a banner above the field — explicit is better than implicit, and a
  // tester will want to see it.
  const [inlineCode, setInlineCode] = useState(params.inlineCode ?? '');
  const [notice, setNotice] = useState(params.notice ?? '');
  const [code, setCode] = useState(params.inlineCode ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function verify() {
    if (!phone || code.length !== 6) {
      Alert.alert(t('common.error'), t('auth.invalid_code'));
      return;
    }
    setSubmitting(true);
    try {
      const r = await verifyOtp(phone, code);
      if (isMultiOrg(r)) {
        router.replace({
          pathname: '/auth/select-org',
          params: { ticket: r.ticket, orgs: JSON.stringify(r.orgs) },
        });
        return;
      }
      await secureStorage.setAccessToken(r.access_token);
      setSession(r.access_token);
      router.replace('/home');
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const msg = status === 401 ? t('auth.invalid_code') : getApiError(err);
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!phone) return;
    setResending(true);
    try {
      const r = await requestOtp(phone);
      // If we're still in inline mode, refresh the displayed code +
      // prefilled input so the banner stays in sync.
      if (r.code) {
        setInlineCode(r.code);
        setCode(r.code);
        if (r.notice) setNotice(r.notice);
      }
      setSecondsLeft(60);
    } catch (err) {
      Alert.alert(t('common.error'), getApiError(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>{t('auth.code_label')}</Text>
        {to ? (
          <Text style={styles.subtitle}>{t('auth.code_sent_email', { to })}</Text>
        ) : null}
      </View>

      {inlineCode ? (
        <View style={styles.codeBanner}>
          <Text style={styles.codeBannerLabel}>
            {notice || 'Your code'}
          </Text>
          <Text style={styles.codeBannerValue}>{inlineCode}</Text>
        </View>
      ) : null}

      <Field
        label={t('auth.code_label')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
      />

      <View style={{ height: space.lg }} />

      <Button label={t('auth.verify')} onPress={verify} loading={submitting} block />

      <View style={{ height: space.md }} />

      <Button
        label={
          secondsLeft > 0 ? `${t('auth.resend')} (${secondsLeft}s)` : t('auth.resend')
        }
        onPress={resend}
        loading={resending}
        disabled={secondsLeft > 0}
        variant="ghost"
        block
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.xxl, marginBottom: space.xl },
  title: { color: colors.text, fontSize: fontSize.h1, fontWeight: '800' },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.body,
    marginTop: space.sm,
  },
  // Banner that appears in inline-OTP mode (pre-SMS) so the user can
  // see and copy the code without leaving the app.
  codeBanner: {
    backgroundColor: '#F0FDFA', // teal-50 — readable + on-brand
    borderColor: '#5EEAD4',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.lg,
    alignItems: 'center',
  },
  codeBannerLabel: {
    color: colors.textMuted,
    fontSize: fontSize.small,
    marginBottom: space.xs,
    textAlign: 'center',
  },
  codeBannerValue: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
  },
});
