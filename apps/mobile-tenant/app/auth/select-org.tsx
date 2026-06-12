/**
 * Step 3 (multi-org only): pick which PG to enter, exchange the ticket for
 * a JWT bound to that org.
 */
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '../../components/ui';
import { selectOrg, getApiError } from '../../lib/api';
import { secureStorage } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, shadow, space, type as fontSize } from '../../lib/theme';

interface Org {
  id: string;
  name: string;
  slug: string;
}

export default function SelectOrgScreen() {
  const { ticket, orgs } = useLocalSearchParams<{ ticket: string; orgs: string }>();
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);

  const parsed: Org[] = useMemo(() => {
    try {
      return JSON.parse(orgs ?? '[]') as Org[];
    } catch {
      return [];
    }
  }, [orgs]);

  const [pickingId, setPickingId] = useState<string | null>(null);

  async function pick(org: Org) {
    if (!ticket) return;
    setPickingId(org.id);
    try {
      const r = await selectOrg(ticket, org.id);
      await secureStorage.setAccessToken(r.access_token);
      setSession(r.access_token);
      router.replace('/home');
    } catch (err) {
      Alert.alert(t('common.error'), getApiError(err));
    } finally {
      setPickingId(null);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>{t('auth.pick_org')}</Text>
        <Text style={styles.subtitle}>{t('auth.pick_org_help')}</Text>
      </View>

      <FlatList
        data={parsed}
        keyExtractor={(o) => o.id}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            disabled={pickingId !== null}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.row,
              pressed && { opacity: 0.85 },
              pickingId === item.id && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.rowText}>{item.name}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.xxl, marginBottom: space.lg },
  title: { color: colors.text, fontSize: fontSize.h1, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.body, marginTop: space.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  rowText: { color: colors.text, fontSize: fontSize.bodyLg, fontWeight: '600' },
});
