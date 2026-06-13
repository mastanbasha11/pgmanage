/**
 * 6-digit code entry. Rebuilt on the new UI kit.
 *
 * When the backend is in inline-OTP mode (pre-WhatsApp/SMS) we surface
 * the code in a hero card above the field AND pre-fill the input so the
 * user can just tap Verify. The card disappears the moment the server
 * stops returning a `code` field.
 *
 * Post-verify routing depends on whether the user's KYC is complete
 * (server-derived). New users land on /onboarding; existing users on
 * /home.
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';

import {
  Button,
  Card,
  Field,
  Screen,
  toast,
} from '../../components/ui';
import {
  isMultiOrg,
  verifyOtp,
  requestOtp,
  getApiError,
} from '../../lib/api';
import { secureStorage } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

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

  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();

  const [inlineCode, setInlineCode] = useState(params.inlineCode ?? '');
  const [notice, setNotice] = useState(params.notice ?? '');
  const [code, setCode] = useState(params.inlineCode ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(
      () => setSecondsLeft((s) => Math.max(s - 1, 0)),
      1000,
    );
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
        // Resident app is single-property for Phase 2 — but if someone
        // installed the app and the server still returns a multi-org
        // response, we direct them at the staff (PG owner) rather than
        // building a picker.
        Alert.alert(
          t('common.error'),
          'Multiple PGs found. Please ask your PG owner to clarify your account.',
        );
        return;
      }
      await secureStorage.setAccessToken(r.access_token);
      setSession(r.access_token);
      toast.success('Signed in');
      // Routing decision (onboarding vs home) happens in the post-login
      // navigation guard reading useProfile().kycComplete. We replace to
      // /home; the guard pushes /onboarding/welcome if needed.
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
      if (r.code) {
        setInlineCode(r.code);
        setCode(r.code);
        if (r.notice) setNotice(r.notice);
      }
      setSecondsLeft(60);
      toast.info('Code resent');
    } catch (err) {
      Alert.alert(t('common.error'), getApiError(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.h1,
            lineHeight: lineHeight.h1,
            fontWeight: fontWeight.extrabold,
          }}
        >
          {t('auth.code_label')}
        </Text>
        {to ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              lineHeight: lineHeight.body,
              marginTop: space.sm,
            }}
          >
            {t('auth.code_sent_email', { to })}
          </Text>
        ) : (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              lineHeight: lineHeight.body,
              marginTop: space.sm,
            }}
          >
            Sent to {phone}
          </Text>
        )}
      </View>

      {inlineCode ? (
        <Card variant="hero" style={{ marginBottom: space.xl }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              textAlign: 'center',
              marginBottom: space.xs,
            }}
          >
            {notice || 'Your code'}
          </Text>
          <Text
            style={{
              color: colors.accent,
              fontSize: 36,
              fontWeight: fontWeight.extrabold,
              letterSpacing: 8,
              textAlign: 'center',
            }}
          >
            {inlineCode}
          </Text>
        </Card>
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

      <Button
        label={t('auth.verify')}
        onPress={verify}
        loading={submitting}
        size="lg"
        block
      />

      <View style={{ height: space.md }} />

      <Button
        label={
          secondsLeft > 0
            ? `${t('auth.resend')} (${secondsLeft}s)`
            : t('auth.resend')
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
  hero: { marginTop: 32, marginBottom: 24 },
});
