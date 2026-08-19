/**
 * Delete account — App Store Guideline 5.1.1(v).
 *
 * Lets a signed-in resident permanently delete their account from within
 * the app: revokes their login identity and strips all personal data
 * (DELETE /tenant/me). After success the session is cleared and the user
 * is returned to the login screen. A confirmation step guards against
 * accidental taps.
 */
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Screen, toast } from '../components/ui';
import { api, getApiError } from '../lib/api';
import { secureStorage } from '../lib/storage';
import { useAppStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const [deleting, setDeleting] = useState(false);

  function confirm() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your PGManage account and removes your personal information. This cannot be undone, and you will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: doDelete },
      ],
    );
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.delete('/tenant/me');
      await secureStorage.clear();
      useAppStore.getState().signOut();
      toast.success('Your account has been deleted');
      router.replace('/auth/login');
    } catch (err) {
      Alert.alert('Could not delete account', getApiError(err));
      setDeleting(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Delete account',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.lg,
            backgroundColor: colors.dangerBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: space.lg,
          }}
        >
          <Ionicons name="trash-outline" size={26} color={colors.dangerFg} />
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.h2,
            fontWeight: fontWeight.extrabold,
            marginTop: space.md,
          }}
        >
          Delete your account
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            lineHeight: lineHeight.body,
            marginTop: space.sm,
          }}
        >
          This permanently deletes your PGManage account. It cannot be undone.
        </Text>

        <Card style={{ marginTop: space.lg }}>
          {[
            'Your login and personal profile are permanently removed.',
            'Your name, phone, email, emergency contact and vehicle details are erased.',
            'You will be signed out and can no longer access this account.',
            'Your PG keeps only anonymised records required for its accounts.',
          ].map((line) => (
            <View
              key={line}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: 6 }}
            >
              <Ionicons name="ellipse" size={6} color={colors.textDim} style={{ marginTop: 7 }} />
              <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 }}>
                {line}
              </Text>
            </View>
          ))}
        </Card>

        <View style={{ height: space.xl }} />
        <Button
          label="Delete my account"
          onPress={confirm}
          loading={deleting}
          variant="danger"
          size="lg"
          iconName="trash-outline"
          block
        />
        <Text
          style={{
            color: colors.textDim,
            fontSize: fontSize.caption,
            textAlign: 'center',
            marginTop: space.md,
            lineHeight: 18,
          }}
        >
          You can also request deletion at pgmanage.in/delete-account
        </Text>
      </ScrollView>
    </Screen>
  );
}
