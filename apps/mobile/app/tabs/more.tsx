/**
 * Settings tab (kept on the "more" route slug for back-compat with the
 * existing tab bar wiring). Holds:
 *   - User card (signed-in identity)
 *   - Language picker (en / hi / te)
 *   - Simple Mode toggle (changes label vocabulary)
 *   - Voice guidance toggle (reads screen titles aloud)
 *   - Property switcher
 *   - About / version
 *   - Sign out
 */
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { setLocale, t, type Lang } from '../../lib/i18n';
import { speak, stopSpeaking } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { Card, Header, Screen } from '../../components/ui';

export default function SettingsTab() {
  const {
    user,
    lang,
    simpleMode,
    voiceGuidance,
    selectedPropertyId,
    setLang,
    setSimpleMode,
    setVoiceGuidance,
    setSelectedProperty,
    logout,
  } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    if (voiceGuidance) speak(t('set.title'));
  }, [voiceGuidance]);

  const { data: props } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () =>
      api.get<{ items: { id: string; name: string }[] }>('/properties').then((r) => r.data),
  });

  function handleSignout() {
    Alert.alert(t('common.signout'), 'Are you sure?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.signout'),
        style: 'destructive',
        onPress: async () => {
          stopSpeaking();
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  }

  function pickLang(l: Lang) {
    setLocale(l);
    setLang(l);
    if (voiceGuidance) speak(t('set.language'));
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Header title={t('set.title')} />

        {/* User card */}
        {user && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userMeta}>
                  {user.email} · {user.role}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Manage — secondary screens not in the bottom bar. */}
        <Card>
          <Text style={styles.label}>Manage</Text>
          <View style={{ gap: space.xs, marginTop: space.sm }}>
            <Row
              iconName="business-outline"
              label="Properties & Setup"
              onPress={() => router.push('/properties')}
            />
            <Row
              iconName="megaphone-outline"
              label="Leads"
              onPress={() => router.push('/tabs/leads')}
            />
            <Row
              iconName="receipt-outline"
              label="Expenses"
              onPress={() => router.push('/tabs/expenses')}
            />
            <Row
              iconName="bed-outline"
              label={t('tab.rooms')}
              onPress={() => router.push('/tabs/rooms')}
            />
            <Row
              iconName="chatbubbles-outline"
              label="WA Message Log"
              onPress={() => router.push('/messages')}
            />
          </View>
        </Card>

        {/* Property switcher */}
        {(props?.items ?? []).length > 1 && (
          <Card>
            <Text style={styles.label}>{t('set.property')}</Text>
            <View style={{ gap: space.xs, marginTop: space.sm }}>
              {(props?.items ?? []).map((p) => (
                <Row
                  key={p.id}
                  iconName="business-outline"
                  label={p.name}
                  selected={selectedPropertyId === p.id}
                  onPress={() => setSelectedProperty(p.id)}
                />
              ))}
            </View>
          </Card>
        )}

        {/* Language */}
        <Card>
          <Text style={styles.label}>{t('set.language')}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            {(['en', 'hi', 'te'] as Lang[]).map((l) => {
              const labelMap: Record<Lang, string> = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' };
              const active = lang === l;
              return (
                <Pressable
                  key={l}
                  onPress={() => pickLang(l)}
                  style={[styles.langChip, active && styles.langChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                    {labelMap[l]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Simple Mode + Voice */}
        <Card>
          <ToggleRow
            iconName="happy-outline"
            label={t('set.simple_mode')}
            hint={t('set.simple_mode_desc')}
            value={simpleMode}
            onChange={(v) => {
              setSimpleMode(v);
              if (v && voiceGuidance) speak(t('set.simple_mode'));
            }}
          />
          <View style={styles.divider} />
          <ToggleRow
            iconName="volume-high-outline"
            label={t('set.voice_guidance')}
            hint={t('set.voice_guidance_desc')}
            value={voiceGuidance}
            onChange={(v) => {
              setVoiceGuidance(v);
              if (v) speak(t('set.voice_guidance'));
              else stopSpeaking();
            }}
          />
        </Card>

        {/* About */}
        <Card>
          <Row
            iconName="information-circle-outline"
            label={t('set.version')}
            value={Constants.expoConfig?.version ?? '0.0.0'}
          />
        </Card>

        {/* Sign out */}
        <Pressable
          onPress={handleSignout}
          style={styles.signoutBtn}
          android_ripple={{ color: colors.dangerBg }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.signoutText}>{t('common.signout')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Row({
  iconName,
  label,
  value,
  selected,
  onPress,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={onPress ? { color: 'rgba(0,0,0,0.05)' } : undefined}
      style={[styles.row, selected && { backgroundColor: colors.surfaceMuted }]}
    >
      <Ionicons name={iconName} size={20} color={selected ? colors.accent : colors.textMuted} />
      <Text style={[styles.rowLabel, selected && { color: colors.accent, fontWeight: '700' }]}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {selected ? (
        <Ionicons name="checkmark" size={18} color={colors.accent} />
      ) : value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : null}
    </Pressable>
  );
}

function ToggleRow({
  iconName,
  label,
  hint,
  value,
  onChange,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Ionicons name={iconName} size={20} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: fontSize.h3, fontWeight: '700' },
  userName: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  userMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },

  label: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },

  langChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langChipText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  langChipTextActive: { color: colors.white },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    minHeight: 44,
  },
  rowLabel: { fontSize: fontSize.body, color: colors.text, fontWeight: '600' },
  rowValue: { fontSize: fontSize.small, color: colors.textMuted },
  hint: { fontSize: fontSize.caption, color: colors.textDim, marginTop: 2 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: 52,
  },

  signoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerBg,
    borderRadius: radius.md,
  },
  signoutText: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.danger },
});
