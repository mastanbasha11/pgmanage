/**
 * Home skeleton — fetches /tenant/me and shows the greeting + the four V1
 * sections (Dues, Complaints, Notices, Menu). Each section is a stub on
 * Day 1; subsequent days fill them in.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { api, getApiError } from '../../lib/api';
import { secureStorage } from '../../lib/storage';
import { useAppStore, TenantProfile } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, shadow, space, type as fontSize } from '../../lib/theme';
import { Screen } from '../../components/ui';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const signOut = useAppStore((s) => s.signOut);
  const [loading, setLoading] = useState(!profile);

  useEffect(() => {
    if (profile) return;
    (async () => {
      try {
        const r = await api.get<TenantProfile>('/tenant/me');
        setProfile(r.data);
      } catch (err) {
        Alert.alert(t('common.error'), getApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [profile, setProfile]);

  async function doSignOut() {
    await secureStorage.clear();
    signOut();
    router.replace('/auth/login');
  }

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {profile?.name
              ? t('home.greeting', { name: profile.name })
              : t('home.greeting_anon')}
          </Text>
          {profile?.property_name ? (
            <Text style={styles.subtitle}>
              {profile.property_name}
              {profile.room_number ? ` · Room ${profile.room_number}` : ''}
              {profile.bed_label ? ` · Bed ${profile.bed_label}` : ''}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <Text style={styles.loading}>{t('common.loading')}</Text>
        ) : (
          <View style={{ gap: space.md }}>
            <SectionCard title={t('home.dues')} body={t('home.empty')} />
            <SectionCard title={t('home.complaints')} body={t('home.empty')} />
            <SectionCard title={t('home.notices')} body={t('home.empty')} />
            <SectionCard title={t('home.menu_today')} body={t('home.empty')} />
          </View>
        )}

        <Pressable onPress={doSignOut} style={styles.signOut} hitSlop={8}>
          <Text style={styles.signOutText}>{t('common.signout')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function SectionCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: space.lg, marginBottom: space.lg },
  greeting: { color: colors.text, fontSize: fontSize.h1, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.body, marginTop: space.xs },
  loading: { color: colors.textMuted, marginTop: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardTitle: { color: colors.text, fontSize: fontSize.h3, fontWeight: '700' },
  cardBody: { color: colors.textMuted, fontSize: fontSize.body, marginTop: space.xs },
  signOut: {
    alignSelf: 'center',
    marginTop: space.xl,
    padding: space.md,
  },
  signOutText: { color: colors.accent, fontWeight: '700', fontSize: fontSize.body },
});
