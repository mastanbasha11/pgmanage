/**
 * Step 1 of sign-in: phone entry.
 *
 * Calls POST /tenant/auth/otp { phone }. Response shapes:
 *   - delivery=email → store the masked address + navigate to /auth/code
 *   - delivery=none  → still navigate to /auth/code so we don't leak
 *     "this number isn't registered". The verify step will fail with 401.
 *   - 409 NO_DELIVERY_CHANNEL → show a friendly help message and let the
 *     user back out (they need to call their PG owner).
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';

import { Button, Field, Screen } from '../../components/ui';
import { requestOtp, getApiError } from '../../lib/api';
import { looksLikeIndianMobile, normalisePhone } from '../../lib/phone';
import { prefStorage } from '../../lib/storage';
import { t } from '../../lib/i18n';
import { colors, space, type as fontSize } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const normalised = normalisePhone(phone);
    if (!looksLikeIndianMobile(normalised)) {
      Alert.alert(t('common.error'), 'Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setSending(true);
    try {
      const r = await requestOtp(normalised);
      await prefStorage.setIdentityPhone(normalised);
      router.push({
        pathname: '/auth/code',
        params: { phone: normalised, to: r.to ?? '', delivery: r.delivery },
      });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        Alert.alert(t('common.error'), t('auth.no_email_help'));
        return;
      }
      Alert.alert(t('common.error'), getApiError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>{t('auth.welcome')}</Text>
        <Text style={styles.subtitle}>{t('auth.signin_prompt')}</Text>
      </View>

      <Field
        label={t('auth.phone_label')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder={t('auth.phone_placeholder')}
        maxLength={20}
      />

      <View style={{ height: space.lg }} />

      <Button label={t('auth.send_code')} onPress={send} loading={sending} block />
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
});
