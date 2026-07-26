/**
 * Resident Home — one calm "today" digest: the rent anchor card, four quick
 * actions, the latest house announcement, and any open help request.
 */
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, space } from '../../../lib/theme';
import {
  useTenantProfile,
  useTenantDues,
  useTenantNotices,
  useTenantTickets,
} from '../../../lib/tenant/hooks';
import {
  TScreen,
  TAppBar,
  TCard,
  TIconBtn,
  TButton,
  TPill,
  Cap,
  rupees,
} from '../../../components/tenant-ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const QUICK: { key: string; label: string; icon: IconName; href: string }[] = [
  { key: 'pay', label: 'Pay rent', icon: 'wallet-outline', href: '/tenant-portal/pay' },
  { key: 'help', label: 'Get help', icon: 'construct-outline', href: '/tenant-portal/more' },
  { key: 'stay', label: 'My stay', icon: 'bed-outline', href: '/tenant-portal/stay' },
  { key: 'food', label: 'Menu', icon: 'restaurant-outline', href: '/tenant-portal/food' },
];

export default function TenantHome() {
  const router = useRouter();
  const profile = useTenantProfile();
  const dues = useTenantDues();
  const notices = useTenantNotices();
  const tickets = useTenantTickets();

  const firstName = (profile.data?.name ?? 'there').split(' ')[0];
  const d = dues.data;
  const openTickets = (tickets.data ?? []).filter(
    (t) => t.status !== 'resolved',
  );
  const latestNotice = notices.data?.[0];

  const dueTone =
    d?.status === 'paid' ? 'money' : 'warm';
  const dueLabel =
    d?.status === 'paid'
      ? 'Paid'
      : d && d.daysUntilDue < 0
        ? `Overdue ${Math.abs(d.daysUntilDue)}d`
        : d
          ? `Due in ${d.daysUntilDue}d`
          : '—';

  return (
    <TScreen>
      <TAppBar
        title={`Hi, ${firstName}`}
        sub={profile.data?.property.name || 'The LOOP'}
        right={<TIconBtn icon="notifications-outline" />}
      />

      {/* Rent anchor — the one number a resident opens the app for. */}
      <TCard variant="dark" style={{ marginTop: space.xs }}>
        <View style={styles.between}>
          <Text style={styles.darkCap}>RENT · {d?.monthLabel?.toUpperCase() ?? '—'}</Text>
          <TPill label={dueLabel} tone={dueTone === 'money' ? 'dark' : 'warm'} />
        </View>
        <Text style={styles.bigAmt}>{rupees(d?.totalPaise)}</Text>
        {d && d.status !== 'paid' && (
          <TButton
            label="Pay now"
            variant="dark"
            icon="arrow-forward"
            style={styles.payBtn}
            onPress={() => router.push('/tenant-portal/pay')}
          />
        )}
        {d?.status === 'paid' && (
          <Text style={styles.paidNote}>You're all settled for this month. 🌿</Text>
        )}
      </TCard>

      {/* Quick actions */}
      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <TouchableOpacity
            key={q.key}
            style={styles.qa}
            activeOpacity={0.7}
            onPress={() => router.push(q.href as never)}
          >
            <View style={styles.qaIcon}>
              <Ionicons name={q.icon} size={20} color={colors.forest} />
            </View>
            <Text style={styles.qaLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Open help request */}
      {openTickets.length > 0 && (
        <>
          <Cap>YOUR REQUESTS</Cap>
          <TCard style={{ paddingVertical: 4 }}>
            {openTickets.slice(0, 2).map((t, i) => (
              <View
                key={t.id}
                style={[styles.reqRow, i === Math.min(openTickets.length, 2) - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.reqTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.reqSub} numberOfLines={1}>
                    {t.status.replace('_', ' ')}
                  </Text>
                </View>
                <TPill label={t.status === 'in_progress' ? 'in progress' : 'received'} tone="warm" />
              </View>
            ))}
          </TCard>
        </>
      )}

      {/* Latest announcement */}
      {latestNotice && (
        <>
          <Cap>FROM THE HOUSE</Cap>
          <TCard variant="tint">
            <View style={styles.between}>
              <Text style={styles.noticeTitle} numberOfLines={1}>
                {latestNotice.title}
              </Text>
              <Ionicons name="megaphone-outline" size={16} color={colors.textMuted} />
            </View>
            <Text style={styles.noticeBody} numberOfLines={3}>
              {latestNotice.body}
            </Text>
          </TCard>
        </>
      )}
    </TScreen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  darkCap: { color: colors.ondark, opacity: 0.85, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  bigAmt: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.6, marginTop: 6 },
  payBtn: { marginTop: 12, backgroundColor: '#ffffff22', borderColor: '#ffffff33' },
  paidNote: { color: colors.ondark, opacity: 0.8, fontSize: 12, marginTop: 8 },
  quickRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  qa: { flex: 1, alignItems: 'center', gap: 7 },
  qaIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: { fontSize: 10.5, fontWeight: '700', color: colors.text },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  reqTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  reqSub: { fontSize: 11, color: colors.textDim, marginTop: 1, textTransform: 'capitalize' },
  noticeTitle: { fontSize: 13, fontWeight: '800', color: colors.text, flex: 1 },
  noticeBody: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
});
