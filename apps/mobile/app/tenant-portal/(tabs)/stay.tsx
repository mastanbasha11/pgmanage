/**
 * Resident My Stay — the room anchor card (tenure, lock-in, deposit), what's
 * included, and documents/people. Move-out starts a 30-day notice.
 */
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space } from '../../../lib/theme';
import { useTenantProfile, useTenantDues } from '../../../lib/tenant/hooks';
import {
  TScreen,
  TAppBar,
  TCard,
  TListRow,
  TButton,
  TPill,
  TIconBtn,
  Cap,
  rupees,
} from '../../../components/tenant-ui';

const SHARING_LABEL: Record<string, string> = {
  single: 'Single occupancy',
  twin: 'Twin sharing',
  triple: 'Triple sharing',
  quad: 'Quad sharing',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function TenantStay() {
  const router = useRouter();
  const profile = useTenantProfile();
  const dues = useTenantDues();
  const p = profile.data;

  const rentLine = dues.data?.lines?.find((l) => l.kind === 'rent');
  const depositPaise = p?.lease.depositPaise || 0;

  return (
    <TScreen>
      <TAppBar
        title="My stay"
        sub={p?.property.name || undefined}
        right={<TIconBtn icon="document-text-outline" />}
      />

      {/* Room anchor */}
      <TCard variant="dark" style={{ marginTop: space.xs }}>
        <View style={styles.between}>
          <View>
            <Text style={styles.roomTitle}>
              Room {p?.room.roomNumber || '—'} · Bed {p?.room.bedLabel || '—'}
            </Text>
            <Text style={styles.roomSub}>
              {SHARING_LABEL[p?.room.sharing ?? 'twin'] ?? 'Sharing'}
            </Text>
          </View>
          {rentLine ? <TPill label={`${rupees(rentLine.amountPaise)}/mo`} tone="dark" /> : null}
        </View>
        <View style={styles.divider} />
        {[
          ['Tenure', `${fmtDate(p?.lease.startDate)} – ${fmtDate(p?.lease.expectedEndDate)}`],
          ['Move-out', p?.lease.expectedEndDate ? fmtDate(p?.lease.expectedEndDate) : 'Open-ended'],
          ...(depositPaise > 0
            ? [['Deposit held', `${rupees(depositPaise)} · refundable`] as [string, string]]
            : []),
        ].map(([k, v]) => (
          <View key={k} style={styles.kvRow}>
            <Text style={styles.kvKey}>{k}</Text>
            <Text style={styles.kvVal}>{v}</Text>
          </View>
        ))}
      </TCard>

      {/* Included */}
      <Cap>INCLUDED</Cap>
      <TCard style={{ paddingVertical: 4 }}>
        <TListRow icon="restaurant-outline" title="Meals" sub="breakfast & dinner daily" />
        <TListRow icon="sparkles-outline" title="Housekeeping" sub="twice a week" />
        <TListRow icon="wifi-outline" title="Wi-Fi" sub="complimentary — no charge" />
        <TListRow icon="bulb-outline" title="Electricity" sub="included in rent" last />
      </TCard>

      {/* Documents & people */}
      <Cap>DOCUMENTS & PEOPLE</Cap>
      <TCard style={{ paddingVertical: 4 }}>
        <TListRow
          icon="document-text-outline"
          title="Agreement & receipts"
          chevron
          onPress={() => Alert.alert('Coming soon', 'Documents will appear here.')}
        />
        <TListRow
          icon="people-outline"
          title="House staff & rules"
          chevron
          last
          onPress={() => Alert.alert('Coming soon', 'House rules will appear here.')}
        />
      </TCard>

      {/* Move out */}
      <TCard style={{ marginTop: space.md }}>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={styles.moTitle}>Planning to move out?</Text>
            <Text style={styles.moSub}>30-day notice · deposit estimate shown first</Text>
          </View>
          <TButton label="Start" small onPress={() => router.push('/tenant-portal/moveout')} />
        </View>
      </TCard>
    </TScreen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roomSub: { color: colors.ondark, opacity: 0.75, fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#ffffff22', marginVertical: 11 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  kvKey: { color: colors.ondark, opacity: 0.72, fontSize: 11.5 },
  kvVal: { color: '#fff', fontSize: 12, fontWeight: '800' },
  moTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  moSub: { fontSize: 11, color: colors.textDim, marginTop: 2 },
});
