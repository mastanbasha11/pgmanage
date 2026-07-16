/**
 * Leads CRM — horizontal-swipe pipeline. Each screen page is one status
 * column (NEW → CONTACTED → SITE_VISITED → NEGOTIATING → BOOKED → CONVERTED
 * → LOST). Swipe between columns; tap a card to open the LeadDetailDrawer;
 * long-press to open a Move-to picker.
 *
 * Filter chips: All · Mine · Due today · No follow-up · Idle > 7d.
 * Add-lead FAB at bottom right.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipStrip,
  Empty,
  Fab,
  Header,
  IconButton,
  Loading,
  Row,
  Screen,
  Sheet,
  StatusPill,
  formatDateHuman,
  rupees,
} from '../../components/ui';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  useLeads,
  useUpdateLead,
  useCreateLead,
  type Lead,
  type LeadStatus,
  type LeadSource,
} from '../../lib/hooks/leads';

const STATUS_TONE: Record<LeadStatus, 'info' | 'warn' | 'accent' | 'success' | 'danger' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warn',
  SITE_VISITED: 'warn',
  NEGOTIATING: 'warn',
  BOOKED: 'accent',
  CONVERTED: 'success',
  LOST: 'danger',
};

type FilterKey = 'all' | 'mine' | 'due-today' | 'no-followup' | 'idle';

const { width: SCREEN_W } = Dimensions.get('window');

export default function LeadsPipelinePage() {
  const router = useRouter();
  const { openLead } = useLocalSearchParams<{ openLead?: string }>();
  const { selectedPropertyId, user, voiceGuidance } = useAppStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [colIndex, setColIndex] = useState(0);
  const scrollerRef = useRef<ScrollView>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (voiceGuidance) speak('Leads');
  }, [voiceGuidance]);

  useEffect(() => {
    if (openLead) setOpenLeadId(openLead);
  }, [openLead]);

  const q = useLeads({
    property_id: selectedPropertyId ?? undefined,
    limit: 500,
  });

  const filtered = useMemo(() => filterLeads(q.data?.items ?? [], filter, user?.user_id), [q.data, filter, user?.user_id]);
  const byStatus = useMemo(() => {
    const m = new Map<LeadStatus, Lead[]>();
    LEAD_STATUSES.forEach((s) => m.set(s, []));
    for (const l of filtered) {
      m.get(l.status)?.push(l);
    }
    return m;
  }, [filtered]);

  const scrollToCol = (idx: number) => {
    const clamped = Math.max(0, Math.min(LEAD_STATUSES.length - 1, idx));
    setColIndex(clamped);
    scrollerRef.current?.scrollTo({ x: clamped * SCREEN_W, animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <Header
          title="Leads"
          subtitle={`${filtered.length} in pipeline`}
          right={
            <IconButton
              name="search-outline"
              accessibilityLabel="Search"
              onPress={() => {
                /* future: search filter */
              }}
            />
          }
        />
        <ChipStrip>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} count={q.data?.items?.length} />
          <Chip label="Mine" iconName="person-outline" active={filter === 'mine'} onPress={() => setFilter('mine')} />
          <Chip label="Due today" iconName="alarm-outline" active={filter === 'due-today'} onPress={() => setFilter('due-today')} tone="warn" />
          <Chip label="No follow-up" active={filter === 'no-followup'} onPress={() => setFilter('no-followup')} />
          <Chip label="Idle > 7d" iconName="hourglass-outline" active={filter === 'idle'} onPress={() => setFilter('idle')} />
        </ChipStrip>

        {/* Column nav strip */}
        <View style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            name="chevron-back"
            accessibilityLabel="Prev column"
            onPress={() => scrollToCol(colIndex - 1)}
            disabled={colIndex === 0}
          />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.colTitle}>
              {LEAD_STATUS_LABELS[LEAD_STATUSES[colIndex]]}
            </Text>
            <Text style={styles.colHint}>
              {byStatus.get(LEAD_STATUSES[colIndex])?.length ?? 0} leads · {colIndex + 1} of {LEAD_STATUSES.length}
            </Text>
            <View style={styles.dotsRow}>
              {LEAD_STATUSES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === colIndex ? colors.accent : colors.surfaceMuted2,
                      width: i === colIndex ? 20 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          <IconButton
            name="chevron-forward"
            accessibilityLabel="Next column"
            onPress={() => scrollToCol(colIndex + 1)}
            disabled={colIndex === LEAD_STATUSES.length - 1}
          />
        </View>
      </View>

      {q.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          ref={scrollerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            setColIndex(Math.round(x / SCREEN_W));
          }}
        >
          {LEAD_STATUSES.map((s) => (
            <View key={s} style={{ width: SCREEN_W }}>
              <FlatList
                data={byStatus.get(s) ?? []}
                keyExtractor={(l) => l.id}
                contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
                refreshControl={
                  <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.accent} />
                }
                renderItem={({ item }) => (
                  <LeadCard
                    lead={item}
                    onPress={() => setOpenLeadId(item.id)}
                    onLongPress={() => setMoveTarget(item)}
                  />
                )}
                ListEmptyComponent={
                  <Empty
                    iconName={s === 'LOST' ? 'close-circle-outline' : 'megaphone-outline'}
                    title={`No ${LEAD_STATUS_LABELS[s].toLowerCase()} leads`}
                    hint={s === 'NEW' ? 'Tap + to add manually or wait for website leads.' : 'Swipe between columns to see leads at other stages.'}
                  />
                }
              />
            </View>
          ))}
        </ScrollView>
      )}

      <Fab
        name="add"
        accessibilityLabel="Add lead"
        onPress={() => setAddOpen(true)}
      />

      {openLeadId && (
        <LeadDetailDrawer
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
        />
      )}

      {moveTarget && (
        <MoveSheet
          lead={moveTarget}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {addOpen && <AddLeadSheet onClose={() => setAddOpen(false)} />}
    </View>
  );
}

// ── Lead card in a pipeline column ──────────────────────────────────────────

function LeadCard({
  lead,
  onPress,
  onLongPress,
}: {
  lead: Lead;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const followupSoon = isDueSoon(lead.next_followup_at);
  return (
    <Card
      onPress={onPress}
      style={{
        ...styles.leadCard,
        borderLeftColor: followupSoon ? colors.warn : colors.border,
        borderLeftWidth: 4,
      }}
    >
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        android_ripple={{ color: 'rgba(0,0,0,0.03)' }}
        style={{ gap: space.sm }}
      >
        <Row gap={space.sm}>
          <Avatar name={lead.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.leadName} numberOfLines={1}>
              {lead.name}
            </Text>
            <Text style={styles.leadPhone}>{lead.phone}</Text>
          </View>
          <StatusPill label={lead.source ?? 'OTHER'} tone="neutral" />
        </Row>
        <Row gap={space.xs} wrap>
          {lead.room_type && <StatusPill label={lead.room_type} tone="info" />}
          {lead.next_followup_at && (
            <StatusPill
              label={`Follow-up ${formatDateHuman(lead.next_followup_at.slice(0, 10))}`}
              tone={followupSoon ? 'warn' : 'neutral'}
            />
          )}
          {lead.status === 'BOOKED' && lead.advance_paise ? (
            <StatusPill label={`Advance ${rupees(lead.advance_paise)}`} tone="success" />
          ) : null}
        </Row>
        <Row gap={space.sm}>
          <QuickAction icon="call-outline" label="Call" onPress={() => tel(lead.phone)} />
          <QuickAction icon="logo-whatsapp" label="WhatsApp" onPress={() => wa(lead)} tone="success" />
        </Row>
      </Pressable>
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: 'success';
}) {
  const fg = tone === 'success' ? '#1F7A4A' : colors.accent;
  const bg = tone === 'success' ? '#E6F8EE' : colors.surfaceMuted;
  const border = tone === 'success' ? '#25D366' : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
      style={[styles.qa, { backgroundColor: bg, borderColor: border }]}
    >
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={[styles.qaText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

// ── Move-to sheet (long-press) ──────────────────────────────────────────────

function MoveSheet({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const updateLead = useUpdateLead(lead.id);

  const move = async (status: LeadStatus) => {
    try {
      await updateLead.mutateAsync({ status });
      onClose();
    } catch (e) {
      require('react-native').Alert.alert('Move failed', String(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Move ${lead.name} to…`}>
      {LEAD_STATUSES.filter((s) => s !== lead.status).map((s) => (
        <Card key={s} onPress={() => move(s)} style={{ marginBottom: space.sm }}>
          <Row justify="space-between">
            <Text style={{ fontWeight: '600', color: colors.text, fontSize: fontSize.bodyLg }}>
              {LEAD_STATUS_LABELS[s]}
            </Text>
            <StatusPill label={s} tone={STATUS_TONE[s]} />
          </Row>
        </Card>
      ))}
    </Sheet>
  );
}

// ── Add lead sheet ──────────────────────────────────────────────────────────

function AddLeadSheet({ onClose }: { onClose: () => void }) {
  const { selectedPropertyId } = useAppStore();
  const create = useCreateLead();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('WALKIN');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      require('react-native').Alert.alert('Missing', 'Name and phone are required.');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        source,
        property_id: selectedPropertyId ?? undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (e) {
      require('react-native').Alert.alert('Create failed', String(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title="Add lead">
      <FieldLike label="Full name *" value={name} onChangeText={setName} placeholder="Ravi Kumar" />
      <FieldLike label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.fieldLabel}>Source</Text>
      <Row wrap gap={space.xs} style={{ marginBottom: space.md }}>
        {(['WALKIN', 'META_AD', 'INSTAGRAM', 'REFERRAL', 'JUSTDIAL', 'WEBSITE', 'OTHER'] as LeadSource[]).map((s) => (
          <Chip key={s} label={s} active={source === s} onPress={() => setSource(s)} />
        ))}
      </Row>
      <FieldLike label="Notes" value={notes} onChangeText={setNotes} placeholder="Interested in 2-share, joining next month" />
      <Button label="Add lead" onPress={submit} loading={create.isPending} block />
    </Sheet>
  );
}

// Small inline text field to avoid pulling in Field's marginBottom.
function FieldLike(props: React.ComponentProps<typeof import('react-native').TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        <TextInputHost {...rest} />
      </View>
    </View>
  );
}
function TextInputHost(props: React.ComponentProps<typeof import('react-native').TextInput>) {
  const { TextInput } = require('react-native');
  return <TextInput placeholderTextColor={colors.textDim} style={{ padding: 0, fontSize: fontSize.bodyLg, color: colors.text }} {...props} />;
}

// ── Detail drawer ───────────────────────────────────────────────────────────

function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data: lead, refetch } = useLeads({ limit: 500 });
  const l = lead?.items?.find((x) => x.id === leadId);
  const update = useUpdateLead(leadId);

  if (!l) return null;

  const setStatus = async (status: LeadStatus, extra?: { advance_paise?: number; lost_reason?: string }) => {
    try {
      await update.mutateAsync({ status, ...extra });
      refetch();
      onClose();
    } catch (e) {
      require('react-native').Alert.alert('Update failed', String(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title={l.name}>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <StatusPill label={LEAD_STATUS_LABELS[l.status]} tone={STATUS_TONE[l.status]} />
        <StatusPill label={l.source ?? 'OTHER'} tone="neutral" />
      </Row>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Button label="Call" iconName="call-outline" variant="secondary" onPress={() => tel(l.phone)} block style={{ flex: 1 }} />
        <Button label="WhatsApp" iconName="logo-whatsapp" variant="secondary" onPress={() => wa(l)} block style={{ flex: 1 }} />
      </Row>

      <Card style={{ marginBottom: space.md }}>
        <DetailRow label="Phone" value={l.phone} />
        <DetailRow label="Email" value={l.email ?? '—'} />
        <DetailRow label="Room type" value={l.room_type ?? '—'} />
        <DetailRow label="Budget" value={l.budget_paise ? rupees(l.budget_paise) : '—'} />
        <DetailRow label="Move-in" value={formatDateHuman(l.move_in_date)} />
        <DetailRow label="Follow-up" value={formatDateHuman(l.next_followup_at ?? undefined)} />
        <DetailRow label="Assigned to" value={l.assigned_to_name ?? l.assigned_to ?? '—'} />
        {l.notes && <DetailRow label="Notes" value={l.notes} />}
      </Card>

      <Text style={styles.fieldLabel}>Move to</Text>
      <Row wrap gap={space.xs} style={{ marginBottom: space.md }}>
        {LEAD_STATUSES.filter((s) => s !== l.status).map((s) => (
          <Chip
            key={s}
            label={LEAD_STATUS_LABELS[s]}
            onPress={() => setStatus(s)}
            tone={STATUS_TONE[s]}
          />
        ))}
      </Row>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: fontSize.body, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tel(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\D/g, '')}`).catch(() => null);
}

function wa(lead: Lead) {
  const phone = lead.phone.replace(/\D/g, '');
  const text = `Hi ${lead.name}, following up on your inquiry for PG accommodation. Would you like to schedule a visit?`;
  Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`).catch(() => null);
}

function isDueSoon(iso?: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  const diff = t - Date.now();
  return diff < 24 * 60 * 60 * 1000; // today or overdue
}

function filterLeads(items: Lead[], filter: FilterKey, userId?: string): Lead[] {
  const now = Date.now();
  switch (filter) {
    case 'mine':
      return userId ? items.filter((l) => l.assigned_to === userId) : items;
    case 'due-today':
      return items.filter((l) => l.next_followup_at && Date.parse(l.next_followup_at) - now < 24 * 60 * 60 * 1000);
    case 'no-followup':
      return items.filter((l) => !l.next_followup_at);
    case 'idle':
      return items.filter((l) => {
        const t = Date.parse(l.updated_at ?? l.created_at);
        return now - t > 7 * 24 * 60 * 60 * 1000;
      });
    default:
      return items;
  }
}

const styles = StyleSheet.create({
  colTitle: { fontSize: fontSize.h3, fontWeight: '800', color: colors.text },
  colHint: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  dotsRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },

  leadCard: {
    marginBottom: space.sm,
    padding: space.md,
  },
  leadName: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  leadPhone: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },

  qa: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qaText: { fontSize: fontSize.small, fontWeight: '700' },

  fieldLabel: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  fieldInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
