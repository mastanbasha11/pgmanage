/**
 * Phone entry — first screen of the auth flow.
 *
 * Visual brief: clean, fintech-grade, one job per screen. A friendly
 * intro on top, a generous-spacing phone field below, a single primary
 * action. We use the new themed primitives so this auto-adapts to dark
 * mode at the system level.
 *
 * Backend contract is unchanged from the previous version — POST
 * /tenant/auth/otp with `{ phone }`. The "inline OTP" pre-WhatsApp/SMS
 * mode (server returns the code so we can pre-fill the next screen) is
 * threaded through unchanged.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Field, Screen } from '../../components/ui';
import { requestOtp, getApiError } from '../../lib/api';
import { looksLikeIndianMobile, normalisePhone } from '../../lib/phone';
import { prefStorage } from '../../lib/storage';
import { t } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, space, radius } = useTheme();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const normalised = normalisePhone(phone);
    if (!looksLikeIndianMobile(normalised)) {
      Alert.alert(
        t('common.error'),
        'Enter a valid 10-digit Indian mobile number.',
      );
      return;
    }
    setSending(true);
    try {
      const r = await requestOtp(normalised);
      await prefStorage.setIdentityPhone(normalised);
      router.push({
        pathname: '/auth/code',
        params: {
          phone: normalised,
          to: r.to ?? '',
          delivery: r.delivery,
          inlineCode: r.code ?? '',
          notice: r.notice ?? '',
        },
      });
    } catch (err) {
      Alert.alert(t('common.error'), getApiError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        {/* Brand chip — small, calm, sets the tone */}
        <View
          style={[
            styles.brandChip,
            { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
          ]}
        >
          <Ionicons name="home" size={16} color={colors.accent} />
          <Text
            style={{
              color: colors.accent,
              fontSize: fontSize.small,
              fontWeight: fontWeight.semibold,
              marginLeft: space.xs,
            }}
          >
            PGManage Resident
          </Text>
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.h1,
            lineHeight: lineHeight.h1,
            fontWeight: fontWeight.extrabold,
            marginTop: space.xl,
          }}
        >
          {t('auth.welcome')}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.bodyLg,
            lineHeight: lineHeight.bodyLg,
            marginTop: space.sm,
          }}
        >
          {t('auth.signin_prompt')}
        </Text>
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
        leading={
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              fontWeight: fontWeight.semibold,
            }}
          >
            +91
          </Text>
        }
      />

      <View style={{ height: space.lg }} />

      <Button
        label={t('auth.send_code')}
        onPress={send}
        loading={sending}
        size="lg"
        block
      />

      <View style={{ flex: 1 }} />

      {/* Footer reassurance — calms first-time users */}
      <Text
        style={{
          color: colors.textDim,
          fontSize: fontSize.small,
          textAlign: 'center',
          marginTop: space.xl,
        }}
      >
        We'll send a 6-digit code to confirm it's you.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 32,
    marginBottom: 32,
  },
  brandChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});
