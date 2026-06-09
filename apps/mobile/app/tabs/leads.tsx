/**
 * Leads tab. Lists incoming leads + tap-to-WhatsApp / tap-to-call so an
 * owner sitting at reception can act on inquiries from the phone.
 *
 * Hidden from the tab bar (5 tabs is the phone max). Reachable from:
 *   - Dashboard → Quick actions tile
 *   - More → Manage → Leads row
 */
import { useEffect } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import { Empty, Header, Loading, Screen, StatusPill, rupees } from '../../components/ui';

type LeadStatus = 'NEW' | 'CONTACTED' | 'SITE_VISITED' | 'NEGOTIATING' | 'CONVERTED' | 'LOST';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source?: string;
  status: LeadStatus;
  interested_room_type?: string | null;
  expected_move_in_date?: string | null;
  budget_min_paise?: number | null;
  budget_max_paise?: number | null;
  notes?: string | null;
  created_at: string;
}

const STATUS_TONE: Record<LeadStatus, 'info' | 'success' | 'warn' | 'danger' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warn',
  SITE_VISITED: 'warn',
  NEGOTIATING: 'warn',
  CONVERTED: 'success',
  LOST: 'danger',
};

export default function LeadsTab() {
  const { selectedPropertyId, voiceGuidance } = useAppStore();

  useEffect(() => {
    if (voiceGuidance) speak('Leads');
  }, [voiceGuidance]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['leads-mobile', selectedPropertyId],
    queryFn: () =>
      api
        .get<{ items: Lead[] }>('/leads', {
          params: { property_id: selectedPropertyId, limit: 100 },
        })
        .then((r) => r.data),
    enabled: !!selectedPropertyId,
  });

  const items = data?.items ?? [];

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header
          title="Leads"
          subtitle={`${items.length} ${t('common.empty') === 'Nothing here yet.' && items.length === 0 ? '' : ''}`}
        />
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: space.lg }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => <LeadRow lead={item} />}
          ListEmptyComponent={
            <Empty
              iconName="megaphone-outline"
              title="No leads yet"
              hint="Inquiries from your website or manual entries will show up here."
            />
          }
        />
      )}
    </Screen>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  function onCall() {
    Linking.openURL(`tel:${lead.phone.replace(/\D/g, '')}`).catch(() => null);
  }
  function onWhatsApp() {
    const phone = lead.phone.replace(/\D/g, '');
    const text = `Hi ${lead.name}, this is about your inquiry for PG accommodation. Can we schedule a visit?`;
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`).catch(() => null);
  }

  const budget =
    lead.budget_min_paise || lead.budget_max_paise
      ? `${rupees(lead.budget_min_paise ?? 0)}–${rupees(lead.budget_max_paise ?? 0)}`
      : null;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {lead.name
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {lead.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {lead.phone}
            {lead.source ? ` · ${lead.source}` : ''}
          </Text>
        </View>
        <StatusPill label={lead.status} tone={STATUS_TONE[lead.status] ?? 'neutral'} />
      </View>

      {(lead.interested_room_type || lead.expected_move_in_date || budget) && (
        <View style={styles.detailRow}>
          {lead.interested_room_type && (
            <DetailItem icon="bed-outline" text={lead.interested_room_type} />
          )}
          {lead.expected_move_in_date && (
            <DetailItem icon="calendar-outline" text={lead.expected_move_in_date} />
          )}
          {budget && <DetailItem icon="cash-outline" text={budget} />}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onCall} style={[styles.actionBtn, styles.callBtn]}>
          <Ionicons name="call-outline" size={18} color={colors.accent} />
          <Text style={[styles.actionText, { color: colors.accent }]}>Call</Text>
        </Pressable>
        <Pressable onPress={onWhatsApp} style={[styles.actionBtn, styles.waBtn]}>
          <Ionicons name="logo-whatsapp" size={18} color={'#25D366'} />
          <Text style={[styles.actionText, { color: '#1F7A4A' }]}>WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailItem({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={{ fontSize: fontSize.caption, color: colors.textMuted }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: fontSize.body },
  name: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  detailRow: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap',
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  callBtn: { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
  waBtn: { borderColor: '#25D366', backgroundColor: '#E6F8EE' },
  actionText: { fontSize: fontSize.body, fontWeight: '700' },
});
