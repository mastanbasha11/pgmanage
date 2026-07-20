/**
 * Settings tab (kept on the "more" route slug for back-compat with the existing
 * tab bar wiring). Restyled to the redesign mock:
 *   - Teal hero card: selected property, occupancy, role pill
 *   - 3-column icon-tile grid for every destination
 *   - Preferences (language / simple mode / voice), property switcher, about
 *   - Bottom identity row (avatar + name + role + chevron) and sign out
 *
 * Every navigation target from the previous list layout is preserved.
 */
import { useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useProperties } from '../../lib/hooks/properties';
import { useAppStore } from '../../lib/store';
import { setLocale, t, type Lang } from '../../lib/i18n';
import { speak, stopSpeaking } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { Avatar, Card, Header, Screen } from '../../components/ui';
import { Pill } from '../../components/redesign';

interface Destination {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MANAGE: Destination[] = [
  { key: 'properties', label: 'Properties', icon: 'business-outline', route: '/properties' },
  { key: 'leads', label: 'Leads', icon: 'megaphone-outline', route: '/tabs/leads' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-outline', route: '/bookings' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-open-outline', route: '/inbox' },
  { key: 'expenses', label: 'Expenses', icon: 'receipt-outline', route: '/tabs/expenses' },
  { key: 'roi', label: 'ROI & payback', icon: 'analytics-outline', route: '/roi' },
];

const ADMIN: Destination[] = [
  { key: 'team', label: 'Team', icon: 'people-circle-outline', route: '/settings/team' },
  { key: 'menu', label: 'Weekly menu', icon: 'restaurant-outline', route: '/settings/menu' },
  { key: 'messages', label: 'Message log', icon: 'chatbubbles-outline', route: '/messages' },
  { key: 'jobs', label: 'Job monitor', icon: 'hardware-chip-outline', route: '/settings/jobs' },
  { key: 'audit', label: 'Audit log', icon: 'document-text-outline', route: '/settings/audit' },
];

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

  const properties = useProperties();
  const items = useMemo(() => properties.data?.items ?? [], [properties.data]);
  const current = useMemo(
    () => items.find((p) => p.id === selectedPropertyId) ?? items[0],
    [items, selectedPropertyId],
  );

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

  // occupancy_rate already folds RESERVED into occupied (backend rule).
  const pct = Math.round((current?.occupancy_rate ?? 0) * 100);
  const occupied = current?.occupied_beds ?? 0;
  const total = current?.total_beds ?? 0;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Header title={t('set.title')} />

        {/* Hero */}
        <View style={styles.hero}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroName} numberOfLines={1}>
              {current?.name ?? 'No property selected'}
            </Text>
            <Text style={styles.heroStat}>
              {total > 0 ? `${pct}% occupied · ${occupied}/${total} beds` : 'No beds set up yet'}
            </Text>
          </View>
          {!!user?.role && (
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>{user.role.replace(/_/g, ' ')}</Text>
            </View>
          )}
        </View>

        {/* Manage */}
        <View>
          <Text style={styles.gridLabel}>Manage</Text>
          <TileGrid items={MANAGE} onPress={(r) => router.push(r as never)} />
        </View>

        {/* Admin */}
        <View>
          <Text style={styles.gridLabel}>Admin</Text>
          <TileGrid items={ADMIN} onPress={(r) => router.push(r as never)} />
        </View>

        {/* Property switcher */}
        {items.length > 1 && (
          <Card>
            <Text style={styles.label}>{t('set.property')}</Text>
            <View style={{ gap: space.xs, marginTop: space.sm }}>
              {items.map((p) => {
                const selected = selectedPropertyId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedProperty(p.id)}
                    android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                    style={[styles.row, selected && { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Ionicons
                      name="business-outline"
                      size={20}
                      color={selected ? colors.accent : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.rowLabel,
                        selected && { color: colors.accent, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </Pressable>
                );
              })}
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

        {/* Identity row */}
        {user && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={user.name} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.name}
                </Text>
                <Text style={styles.userMeta} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
              <Pill label={user.role.replace(/_/g, ' ').toLowerCase()} tone="s" />
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </View>
          </Card>
        )}

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

function TileGrid({
  items,
  onPress,
}: {
  items: Destination[];
  onPress: (route: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {items.map((d) => (
        <Pressable
          key={d.key}
          onPress={() => onPress(d.route)}
          accessibilityRole="button"
          accessibilityLabel={d.label}
          android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
          style={styles.tile}
        >
          <View style={styles.tileIcon}>
            <Ionicons name={d.icon} size={20} color={colors.accent} />
          </View>
          <Text style={styles.tileLabel} numberOfLines={2}>
            {d.label}
          </Text>
        </Pressable>
      ))}
    </View>
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
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: 14,
  },
  heroName: { fontSize: 16, fontWeight: '800', color: colors.white },
  heroStat: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  heroPillText: { fontSize: 10, fontWeight: '800', color: colors.white, textTransform: 'capitalize' },

  gridLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31.5%',
    minHeight: 84,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },

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
