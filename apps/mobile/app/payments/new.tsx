/**
 * Record Payment screen. Tenant-aware (optional ?tenant_id=...) or
 * tenant-picker if not provided.
 *
 * Mirrors the web AddPaymentDialog: amount, type, mode (cash/UPI/bank),
 * paid-to-by, optional month/year. On success offers a WhatsApp receipt
 * share which deep-links wa.me with a pre-filled message.
 */
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, getApiError, withIdempotency } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { colors, radius, space, type as fontSize } from '../../lib/theme';
import {
  Button,
  Card,
  Field,
  Header,
  IconButton,
  rupees,
  Screen,
  StatusPill,
} from '../../components/ui';

type Mode = 'CASH' | 'UPI' | 'BANK';

export default function RecordPaymentScreen() {
  const { tenant_id, name } = useLocalSearchParams<{ tenant_id?: string; name?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { selectedPropertyId } = useAppStore();

  const [tenantId, setTenantId] = useState<string>(tenant_id ?? '');
  const [tenantName, setTenantName] = useState<string>(name ?? '');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('CASH');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [forMonth, setForMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [forYear, setForYear] = useState<string>(String(new Date().getFullYear()));
  const [tenantQuery, setTenantQuery] = useState('');

  // Tenant search when not pre-selected.
  const { data: tenantList } = useQuery({
    queryKey: ['tenants-pick', selectedPropertyId, tenantQuery],
    enabled: !tenantId && !!selectedPropertyId,
    queryFn: () =>
      api
        .get<{ items: { id: string; name: string; phone: string }[] }>('/tenants', {
          params: { property_id: selectedPropertyId, search: tenantQuery || undefined },
        })
        .then((r) => r.data),
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: object) =>
      api.post('/payments', body, withIdempotency()).then((r) => r.data),
  });

  async function submit() {
    if (!tenantId) {
      Alert.alert('Pick a resident first');
      return;
    }
    const rupeesValue = Number(amount);
    if (!Number.isFinite(rupeesValue) || rupeesValue <= 0) {
      Alert.alert('Enter the amount');
      return;
    }
    try {
      await mutateAsync({
        tenant_id: tenantId,
        amount_paise: Math.round(rupeesValue * 100),
        payment_type: 'RENT',
        payment_mode: mode,
        paid_to: paidTo || undefined,
        reference_number: mode === 'CASH' ? undefined : referenceNumber || undefined,
        for_month: Number(forMonth) || undefined,
        for_year: Number(forYear) || undefined,
      });
      // Invalidate so list views refresh.
      qc.invalidateQueries({ queryKey: ['rent-ledger-mobile'] });
      qc.invalidateQueries({ queryKey: ['resident-payments', tenantId] });
      qc.invalidateQueries({ queryKey: ['dash-summary'] });

      Alert.alert(
        '✅ Payment recorded',
        t('rent.recorded', { amount, name: tenantName || 'resident' }),
        [
          {
            text: t('common.share_whatsapp'),
            onPress: () => shareReceipt(tenantName, rupeesValue, mode),
          },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
    } catch (err) {
      Alert.alert('Error', getApiError(err));
    }
  }

  function shareReceipt(toName: string, amt: number, m: Mode) {
    // wa.me share — opens WhatsApp with a pre-filled text. Doesn't require a
    // specific number, so this is a generic "send to anyone" intent.
    const text = `✅ Rent received: ₹${amt} via ${m} from ${toName}. — PGManage`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => null);
    router.back();
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton name="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <Header title={t('res.record_payment')} subtitle={tenantName || 'New payment'} />
        </View>

        {!tenantId && (
          <Card>
            <Field
              label="Search resident"
              value={tenantQuery}
              onChangeText={setTenantQuery}
              placeholder="Name or phone"
            />
            <View style={{ gap: space.xs }}>
              {(tenantList?.items ?? []).slice(0, 6).map((tn) => (
                <Button
                  key={tn.id}
                  variant="secondary"
                  label={`${tn.name} · ${tn.phone}`}
                  onPress={() => {
                    setTenantId(tn.id);
                    setTenantName(tn.name);
                  }}
                />
              ))}
            </View>
          </Card>
        )}

        {!!tenantId && (
          <>
            <Card>
              <Text style={styles.amountLabel}>{t('rent.amount_label')}</Text>
              <Field
                label=""
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                style={{ marginBottom: 0 }}
              />
            </Card>

            <Card>
              <Text style={styles.modeLabel}>Payment mode</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                {(['CASH', 'UPI', 'BANK'] as const).map((m) => (
                  <Button
                    key={m}
                    variant={mode === m ? 'primary' : 'secondary'}
                    label={t(`rent.mode_${m.toLowerCase()}` as 'rent.mode_cash')}
                    onPress={() => setMode(m)}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
            </Card>

            <Card>
              <Field
                label={t('rent.paid_to_label')}
                value={paidTo}
                onChangeText={setPaidTo}
                placeholder="Suresh / Owner / Mastan"
              />
              {mode !== 'CASH' && (
                <Field
                  label="Reference / UPI ref #"
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                  placeholder="UPI ref id or txn id"
                />
              )}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Field
                  label="Month"
                  value={forMonth}
                  onChangeText={setForMonth}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <Field
                  label="Year"
                  value={forYear}
                  onChangeText={setForYear}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
              </View>
            </Card>

            <Button
              variant="primary"
              iconName="checkmark-circle-outline"
              label={`${t('common.save')}${amount ? ` · ${rupees(Number(amount) * 100)}` : ''}`}
              onPress={submit}
              loading={isPending}
              block
            />
            <StatusPill label="Idempotent" tone="info" />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountLabel: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  modeLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.textMuted },
});
