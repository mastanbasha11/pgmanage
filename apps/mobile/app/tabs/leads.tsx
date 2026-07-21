/**
 * Leads CRM — horizontal-swipe pipeline. Each screen page is one status
 * column (NEW → CONTACTED → SITE_VISITED → NEGOTIATING → BOOKED → CONVERTED
 * → LOST). Swipe between columns; tap a card to open the LeadDetailDrawer;
 * long-press to open a Move-to picker. That swipe interaction is deliberate —
 * a phone has no room for a 7-column kanban, so the columns page instead.
 *
 * Above the board:
 *   · "Match leads → beds" notice — vacant beds vs open demand, per room type.
 *     This is the whole point of the screen: which room type is oversubscribed.
 *   · Funnel line — contact → visit → book conversion, with the bottleneck
 *     stage called out by name.
 *   · Quick-filter chips with live counts.
 *
 * Website Leads is a SEPARATE tab, not a pipeline column: those rows arrive
 * unqualified from the public embed endpoint and get triaged before they earn
 * a place on the board.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppStore } from '../../lib/store';
import { speak } from '../../lib/voice';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Avatar,
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
  Segmented,
  Sheet,
  StatusPill,
  formatDateHuman,
  rupees,
} from '../../components/ui';
import { NoticeCard, Pill, Track, type PillTone } from '../../components/redesign';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  useLeads,
  useNewWebsiteLeadCount,
  useUpdateLead,
  useCreateLead,
  useWebsiteLeads,
  type Lead,
  type LeadStatus,
  type LeadSource,
} from '../../lib/hooks/leads';
import { useVacantBeds } from '../../lib/hooks/properties';

/**
 * `Lead` now mirrors the SELECT in app/api/v1/leads.py exactly, so no widening
 * is needed. These accessors stay because the list endpoint omits
 * `last_contacted_at` for never-contacted leads and the UI wants a stable
 * "last touched" date to sort and bucket by.
 */
type LeadRow = Lead;

const roomTypeOf = (l: LeadRow): string | null => l.interested_room_type || null;
const moveInOf = (l: LeadRow): string | null => l.expected_move_in_date || null;
const lastTouchOf = (l: LeadRow): string => l.last_contacted_at || l.created_at;

const SOURCE_LABEL: Record<LeadSource, string> = {
  META_AD: 'Meta Ad',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referral',
  WALKIN: 'Walk-in',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

/** Paid-media sources read violet; everything inbound reads blue. */
const SOURCE_TONE: Record<LeadSource, PillTone> = {
  META_AD: 'v',
  INSTAGRAM: 'v',
  REFERRAL: 'b',
  WALKIN: 's',
  JUSTDIAL: 'b',
  WEBSITE: 'b',
  OTHER: 's',
};

const STATUS_TONE: Record<LeadStatus, 'info' | 'warn' | 'accent' | 'success' | 'danger' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warn',
  SITE_VISITED: 'warn',
  NEGOTIATING: 'warn',
  BOOKED: 'accent',
  CONVERTED: 'success',
  LOST: 'danger',
};

/** Statuses that no longer need chasing — excluded from "open demand" and
 *  from the idle / no-follow-up nags. */
const CLOSED: LeadStatus[] = ['CONVERTED', 'LOST'];
const isOpen = (l: LeadRow) => !CLOSED.includes(l.status);

type FilterKey = 'all' | 'mine' | 'due-today' | 'overdue' | 'idle' | 'no-followup';

const DAY_MS = 24 * 60 * 60 * 1000;

const { width: SCREEN_W } = Dimensions.get('window');

// ── Date helpers (local midnight, so "today" means the user's today) ────────

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** -n = n days overdue · 0 = due today · +n = due in n days · null = unset. */
function followupOffsetDays(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((startOfDay(new Date(t)) - startOfDay(new Date())) / DAY_MS);
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function LeadsPipelinePage() {
  const insets = useSafeAreaInsets();
  const { openLead } = useLocalSearchParams<{ openLead?: string }>();
  const { selectedPropertyId, user, voiceGuidance } = useAppStore();
  const [tab, setTab] = useState<'pipeline' | 'website'>('pipeline');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [colIndex, setColIndex] = useState(0);
  // The match/funnel insights are collapsed by default so the lead list — the
  // thing you actually work — gets the screen. Tap the summary bar to expand.
  const [insightsOpen, setInsightsOpen] = useState(false);
  const scrollerRef = useRef<ScrollView>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<LeadRow | null>(null);
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
  const websiteCountQ = useNewWebsiteLeadCount();
  const vacantQ = useVacantBeds(selectedPropertyId ?? undefined, { includeUpcoming: false });

  const all = (q.data?.items ?? []) as LeadRow[];

  const counts = useMemo(
    () => ({
      all: all.length,
      mine: user?.user_id ? all.filter((l) => l.assigned_to === user.user_id).length : 0,
      'due-today': all.filter((l) => followupOffsetDays(l.next_followup_at) === 0).length,
      overdue: all.filter((l) => {
        const d = followupOffsetDays(l.next_followup_at);
        return d !== null && d < 0;
      }).length,
      idle: all.filter(
        (l) => isOpen(l) && Date.now() - Date.parse(lastTouchOf(l)) > 7 * DAY_MS,
      ).length,
      'no-followup': all.filter((l) => isOpen(l) && !l.next_followup_at).length,
    }),
    [all, user?.user_id],
  );

  const filtered = useMemo(
    () => filterLeads(all, filter, user?.user_id),
    [all, filter, user?.user_id],
  );

  const byStatus = useMemo(() => {
    const m = new Map<LeadStatus, LeadRow[]>();
    LEAD_STATUSES.forEach((s) => m.set(s, []));
    for (const l of filtered) m.get(l.status)?.push(l);
    return m;
  }, [filtered]);

  // ── Funnel: share of ALL leads that ever reached each stage ──────────────
  // Reach is positional: a CONVERTED lead necessarily passed contact + visit.
  const funnel = useMemo(() => {
    const idx = (s: LeadStatus) => LEAD_STATUSES.indexOf(s);
    // LOST leads dropped out somewhere, but they still reached whatever stage
    // they were at when lost — they just don't get credit for later stages.
    const reached = (stage: LeadStatus) =>
      all.filter((l) => idx(l.status) >= idx(stage) && l.status !== 'LOST').length;
    const total = all.length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    const contact = pct(reached('CONTACTED'));
    const visit = pct(reached('SITE_VISITED'));
    const book = pct(reached('BOOKED'));
    // Bottleneck = the biggest step-down between consecutive stages.
    const drops: { label: string; drop: number }[] = [
      { label: 'first contact', drop: 100 - contact },
      { label: 'visits', drop: contact - visit },
      { label: 'bookings', drop: visit - book },
    ];
    const worst = drops.reduce((a, b) => (b.drop > a.drop ? b : a), drops[0]);
    return { total, contact, visit, book, bottleneck: worst.label };
  }, [all]);

  // ── Supply → demand per room type ───────────────────────────────────────
  const match = useMemo(() => {
    const supply = new Map<string, number>();
    for (const b of vacantQ.data?.items ?? []) {
      if (b.status && b.status !== 'VACANT') continue;
      const key = b.room_type || 'Unspecified';
      supply.set(key, (supply.get(key) ?? 0) + 1);
    }
    const demand = new Map<string, number>();
    for (const l of all) {
      if (!isOpen(l)) continue;
      const rt = roomTypeOf(l);
      if (!rt) continue;
      demand.set(rt, (demand.get(rt) ?? 0) + 1);
    }
    const keys = Array.from(new Set([...supply.keys(), ...demand.keys()]))
      .filter((k) => k !== 'Unspecified' || (supply.get(k) ?? 0) > 0)
      .sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0));
    return keys.map((k) => ({
      roomType: k,
      supply: supply.get(k) ?? 0,
      demand: demand.get(k) ?? 0,
    }));
  }, [vacantQ.data, all]);

  const scrollToCol = (idx: number) => {
    const clamped = Math.max(0, Math.min(LEAD_STATUSES.length - 1, idx));
    setColIndex(clamped);
    scrollerRef.current?.scrollTo({ x: clamped * SCREEN_W, animated: true });
  };

  const newWebsiteCount = websiteCountQ.data?.count ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm }}>
        <Header
          title="Leads"
          subtitle={`${filtered.length} of ${all.length} in pipeline`}
          right={
            <IconButton
              name="refresh-outline"
              accessibilityLabel="Refresh leads"
              onPress={() => q.refetch()}
            />
          }
        />

        <Segmented<'pipeline' | 'website'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pipeline', label: 'Pipeline', iconName: 'git-branch-outline' },
            {
              value: 'website',
              label: newWebsiteCount > 0 ? `Website (${newWebsiteCount})` : 'Website',
              iconName: 'globe-outline',
            },
          ]}
        />
      </View>

      {tab === 'website' ? (
        <WebsiteLeadsTab
          propertyId={selectedPropertyId ?? undefined}
          onOpenLead={setOpenLeadId}
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            {/* Collapsible insights — summary bar always visible, detail on tap */}
            {(match.length > 0 || funnel.total > 0) && (
              <Pressable
                onPress={() => setInsightsOpen((v) => !v)}
                style={styles.insightsBar}
                accessibilityRole="button"
                accessibilityState={{ expanded: insightsOpen }}
              >
                <Text style={styles.insightsSummary} numberOfLines={1}>
                  🎯 {match.filter((m) => m.demand > m.supply).length} room types in demand
                  {funnel.total > 0 ? ` · ${funnel.bottleneck} bottleneck` : ''}
                </Text>
                <Ionicons
                  name={insightsOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </Pressable>
            )}

            {insightsOpen && (
              <>
                {/* Match leads → beds */}
                {match.length > 0 && (
                  <NoticeCard tone="accent">
                    <Text style={styles.noticeTitle}>🎯 Match leads → beds</Text>
                    <Text style={styles.noticeSub}>
                      Vacant beds → open leads wanting that type.
                    </Text>
                    <Row gap={space.xs} wrap style={{ marginTop: space.sm }}>
                      {match.map((m) => (
                        <Pill
                          key={m.roomType}
                          label={`${m.roomType} ${m.supply}→${m.demand}`}
                          tone={m.demand > m.supply ? 'r' : m.demand === 0 ? 's' : 'g'}
                          dot
                        />
                      ))}
                    </Row>
                  </NoticeCard>
                )}

                {/* Funnel */}
                {funnel.total > 0 && (
                  <Card style={styles.funnelCard}>
                    <Row gap={space.sm} justify="space-between">
                      <Text style={styles.funnelText}>
                        contact <Text style={styles.funnelNum}>{funnel.contact}%</Text> → visit{' '}
                        <Text style={styles.funnelNum}>{funnel.visit}%</Text> → book{' '}
                        <Text style={styles.funnelNum}>{funnel.book}%</Text>
                      </Text>
                    </Row>
                    <Row gap={4} style={{ marginTop: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Track pct={funnel.contact} color={colors.info} height={5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Track pct={funnel.visit} color={colors.purple} height={5} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Track pct={funnel.book} color={colors.accent} height={5} />
                      </View>
                    </Row>
                    <Text style={styles.funnelFoot}>
                      {funnel.bottleneck} {funnel.bottleneck === 'visits' ? 'are' : 'is'} the
                      bottleneck · {funnel.total} lead{funnel.total === 1 ? '' : 's'} total
                    </Text>
                  </Card>
                )}
              </>
            )}

            <ChipStrip>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} count={counts.all} />
              <Chip
                label="Due today"
                iconName="alarm-outline"
                active={filter === 'due-today'}
                onPress={() => setFilter('due-today')}
                count={counts['due-today']}
                tone="warn"
              />
              <Chip
                label="Overdue"
                iconName="warning-outline"
                active={filter === 'overdue'}
                onPress={() => setFilter('overdue')}
                count={counts.overdue}
                tone="danger"
              />
              <Chip
                label="Idle > 7d"
                iconName="hourglass-outline"
                active={filter === 'idle'}
                onPress={() => setFilter('idle')}
                count={counts.idle}
              />
              <Chip
                label="No follow-up"
                active={filter === 'no-followup'}
                onPress={() => setFilter('no-followup')}
                count={counts['no-followup']}
              />
              <Chip
                label="Mine"
                iconName="person-outline"
                active={filter === 'mine'}
                onPress={() => setFilter('mine')}
                count={counts.mine}
              />
            </ChipStrip>

            {/* Column nav strip */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton
                name="chevron-back"
                accessibilityLabel="Prev column"
                onPress={() => scrollToCol(colIndex - 1)}
                disabled={colIndex === 0}
              />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.colTitle}>{LEAD_STATUS_LABELS[LEAD_STATUSES[colIndex]]}</Text>
                <Text style={styles.colHint}>
                  {byStatus.get(LEAD_STATUSES[colIndex])?.length ?? 0} leads · {colIndex + 1} of{' '}
                  {LEAD_STATUSES.length}
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
              // flex:1 is what makes the columns fill the space below the
              // header block. Without it the ScrollView collapsed to its
              // intrinsic height and each column's list showed in a sliver at
              // the bottom of the screen, un-scrollable.
              style={{ flex: 1 }}
              onMomentumScrollEnd={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                setColIndex(Math.round(x / SCREEN_W));
              }}
            >
              {LEAD_STATUSES.map((s) => (
                <View key={s} style={{ width: SCREEN_W, flex: 1 }}>
                  <FlatList
                    data={byStatus.get(s) ?? []}
                    keyExtractor={(l) => l.id}
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
                    refreshControl={
                      <RefreshControl
                        refreshing={q.isRefetching}
                        onRefresh={q.refetch}
                        tintColor={colors.accent}
                      />
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
                        hint={
                          s === 'NEW'
                            ? 'Tap + to add manually, or check the Website tab.'
                            : 'Swipe between columns to see leads at other stages.'
                        }
                      />
                    }
                  />
                </View>
              ))}
            </ScrollView>
          )}

          <Fab name="add" accessibilityLabel="Add lead" onPress={() => setAddOpen(true)} />
        </>
      )}

      {openLeadId && (
        <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      )}

      {moveTarget && <MoveSheet lead={moveTarget} onClose={() => setMoveTarget(null)} />}

      {addOpen && <AddLeadSheet onClose={() => setAddOpen(false)} />}
    </View>
  );
}

// ── Website Leads tab ───────────────────────────────────────────────────────

/**
 * Kept as its own tab rather than a pipeline column: these arrive from the
 * public embed endpoint unqualified, and they get triaged (or binned) before
 * they belong on the board.
 */
function WebsiteLeadsTab({
  propertyId,
  onOpenLead,
}: {
  propertyId?: string;
  onOpenLead: (id: string) => void;
}) {
  const wq = useWebsiteLeads(propertyId);
  const items = ((wq.data as { items?: LeadRow[] } | undefined)?.items ?? []) as LeadRow[];

  if (wq.isLoading) return <Loading label="Loading website leads" />;

  return (
    <FlatList
      data={items}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={wq.isRefetching}
          onRefresh={wq.refetch}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <NoticeCard tone="accent" style={{ marginBottom: space.md }}>
          <Text style={styles.noticeTitle}>🌐 Website leads</Text>
          <Text style={styles.noticeSub}>
            Submitted through the booking form embedded on your own site. Triage
            here — moving one to Contacted puts it on the pipeline board.
          </Text>
        </NoticeCard>
      }
      renderItem={({ item }) => (
        <LeadCard lead={item} onPress={() => onOpenLead(item.id)} onLongPress={() => onOpenLead(item.id)} />
      )}
      ListEmptyComponent={
        <Empty
          iconName="globe-outline"
          title="No website leads yet"
          hint="Embed the booking form on your site and submissions land here."
        />
      }
    />
  );
}

// ── Lead card in a pipeline column ──────────────────────────────────────────

function LeadCard({
  lead,
  onPress,
  onLongPress,
}: {
  lead: LeadRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const offset = followupOffsetDays(lead.next_followup_at);
  const overdue = offset !== null && offset < 0;
  const dueToday = offset === 0;
  const roomType = roomTypeOf(lead);
  const moveIn = moveInOf(lead);
  const source = lead.source ?? 'OTHER';

  const wants = [
    roomType,
    moveIn ? `from ${formatDateHuman(moveIn)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card
      style={{
        ...styles.leadCard,
        borderLeftWidth: 4,
        borderLeftColor: overdue ? colors.danger : dueToday ? colors.warn : colors.borderSoft,
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        android_ripple={{ color: 'rgba(0,0,0,0.03)' }}
        style={{ gap: space.sm }}
      >
        <Row gap={space.sm}>
          <Avatar name={lead.name} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.leadName} numberOfLines={1}>
              {lead.name}
            </Text>
            <Text style={styles.leadPhone} numberOfLines={1}>
              {wants || lead.phone}
            </Text>
          </View>
          <Pill label={SOURCE_LABEL[source]} tone={SOURCE_TONE[source]} />
        </Row>

        <Row gap={space.xs} wrap>
          <Pill label={LEAD_STATUS_LABELS[lead.status]} tone="s" dot />
          {offset !== null && (
            <Pill
              label={
                overdue
                  ? `Overdue ${Math.abs(offset)}d`
                  : dueToday
                    ? 'Due today'
                    : `Follow-up ${formatDateHuman(lead.next_followup_at?.slice(0, 10))}`
              }
              tone={overdue ? 'r' : dueToday ? 'a' : 's'}
              dot={overdue || dueToday}
            />
          )}
          {lead.status === 'BOOKED' && !!lead.advance_paise && (
            <Pill label={`Advance ${rupees(lead.advance_paise)}`} tone="g" />
          )}
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

function MoveSheet({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
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
        {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => (
          <Chip key={s} label={SOURCE_LABEL[s]} active={source === s} onPress={() => setSource(s)} />
        ))}
      </Row>
      <FieldLike
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Interested in 2-share, joining next month"
      />
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
  return (
    <TextInput
      placeholderTextColor={colors.textDim}
      style={{ padding: 0, fontSize: fontSize.bodyLg, color: colors.text }}
      {...props}
    />
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────

function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data: lead, refetch } = useLeads({ limit: 500 });
  const l = ((lead?.items ?? []) as LeadRow[]).find((x) => x.id === leadId);
  const update = useUpdateLead(leadId);

  if (!l) return null;

  const setStatus = async (
    status: LeadStatus,
    extra?: { advance_paise?: number; lost_reason?: string },
  ) => {
    try {
      await update.mutateAsync({ status, ...extra });
      refetch();
      onClose();
    } catch (e) {
      require('react-native').Alert.alert('Update failed', String(e));
    }
  };

  // Budget is stored as a min/max pair; render a range only when the two
  // actually differ, otherwise a single figure reads cleaner.
  const budget =
    l.budget_min_paise && l.budget_max_paise && l.budget_min_paise !== l.budget_max_paise
      ? `${rupees(l.budget_min_paise)} – ${rupees(l.budget_max_paise)}`
      : l.budget_min_paise || l.budget_max_paise
        ? rupees((l.budget_min_paise || l.budget_max_paise) as number)
        : '—';

  return (
    <Sheet open onClose={onClose} title={l.name}>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Pill label={LEAD_STATUS_LABELS[l.status]} tone="s" dot />
        <Pill label={SOURCE_LABEL[l.source ?? 'OTHER']} tone={SOURCE_TONE[l.source ?? 'OTHER']} />
      </Row>
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Button
          label="Call"
          iconName="call-outline"
          variant="secondary"
          onPress={() => tel(l.phone)}
          block
          style={{ flex: 1 }}
        />
        <Button
          label="WhatsApp"
          iconName="logo-whatsapp"
          variant="secondary"
          onPress={() => wa(l)}
          block
          style={{ flex: 1 }}
        />
      </Row>

      <Card style={{ marginBottom: space.md }}>
        <DetailRow label="Phone" value={l.phone} />
        <DetailRow label="Email" value={l.email ?? '—'} />
        <DetailRow label="Room type" value={roomTypeOf(l) ?? '—'} />
        <DetailRow label="Budget" value={budget} />
        <DetailRow label="Move-in" value={formatDateHuman(moveInOf(l))} />
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
    <Row
      justify="space-between"
      style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }}
    >
      <Text style={{ fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: fontSize.body,
          color: colors.text,
          fontWeight: '600',
          flex: 1,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </Row>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tel(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\D/g, '')}`).catch(() => null);
}

function wa(lead: LeadRow) {
  const phone = lead.phone.replace(/\D/g, '');
  const text = `Hi ${lead.name}, following up on your inquiry for PG accommodation. Would you like to schedule a visit?`;
  Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`).catch(() => null);
}

function filterLeads(items: LeadRow[], filter: FilterKey, userId?: string): LeadRow[] {
  switch (filter) {
    case 'mine':
      return userId ? items.filter((l) => l.assigned_to === userId) : items;
    case 'due-today':
      return items.filter((l) => followupOffsetDays(l.next_followup_at) === 0);
    case 'overdue':
      return items.filter((l) => {
        const d = followupOffsetDays(l.next_followup_at);
        return d !== null && d < 0;
      });
    case 'no-followup':
      return items.filter((l) => isOpen(l) && !l.next_followup_at);
    case 'idle':
      return items.filter(
        (l) => isOpen(l) && Date.now() - Date.parse(lastTouchOf(l)) > 7 * DAY_MS,
      );
    default:
      return items;
  }
}

const styles = StyleSheet.create({
  colTitle: { fontSize: fontSize.h3, fontWeight: '800', color: colors.text },
  colHint: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  dotsRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },

  insightsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  insightsSummary: { flex: 1, fontSize: 11.5, fontWeight: '800', color: colors.text },

  noticeTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  noticeSub: { fontSize: 10.5, color: colors.textMuted, fontWeight: '600', marginTop: 2, lineHeight: 14 },

  funnelCard: { padding: space.md },
  funnelText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  funnelNum: { fontWeight: '800', color: colors.text },
  funnelFoot: { fontSize: 10, color: colors.textDim, fontWeight: '700', marginTop: 6 },

  leadCard: {
    marginBottom: space.sm,
    padding: space.md,
  },
  leadName: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
  leadPhone: { fontSize: 10.5, color: colors.textDim, fontWeight: '600', marginTop: 2 },

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
