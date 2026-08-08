/**
 * Give notice to vacate — with the 30-day rule.
 *
 * Picks a move-out date, computes days_notice, shows a warning card
 * when < 30 days saying the advance is non-refundable per policy.
 * On confirm, POSTs to /tenant/me/notice.
 */
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';

import { Button, Card, Field, Screen, toast } from '../components/ui';
import { api, getApiError } from '../lib/api';
import { useProfile } from '../lib/data/hooks';
import { useTheme } from '../lib/theme';
import { useQueryClient } from '@tanstack/react-query';

const POLICY_DAYS = 30;

export default function NoticeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();

  // Default to 30 days out — the "good" default that keeps the advance.
  const defaultDate = format(addDays(new Date(), POLICY_DAYS), 'yyyy-MM-dd');
  const [dateStr, setDateStr] = useState(defaultDate);
  const [submitting, setSubmitting] = useState(false);

  const moveOut = useMemo(() => {
    try {
      return parseISO(dateStr);
    } catch {
      return null;
    }
  }, [dateStr]);

  const daysNotice = useMemo(() => {
    if (!moveOut) return 0;
    return differenceInCalendarDays(moveOut, new Date());
  }, [moveOut]);

  const tooSoon = daysNotice < POLICY_DAYS;
  const invalid = daysNotice < 0;

  const { data: profile } = useProfile();
  const depositPaise = profile?.lease.depositPaise ?? 0;
  const refundPaise = tooSoon ? 0 : depositPaise;
  const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

  async function submit() {
    if (invalid) {
      Alert.alert('Pick a valid date', 'Move-out date must be today or later.');
      return;
    }
    Alert.alert(
      'Confirm notice',
      tooSoon
        ? `Since this is ${daysNotice} day${daysNotice === 1 ? '' : 's'} away, your refundable advance will NOT be returned per the PG's 30-day notice policy.\n\nProceed anyway?`
        : `Your move-out date is ${format(moveOut!, 'd MMM yyyy')}. Your refundable advance will be returned at checkout.\n\nProceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Give notice',
          style: tooSoon ? 'destructive' : 'default',
          onPress: () => doSubmit(),
        },
      ],
    );
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      await api.post('/tenant/me/notice', { move_out_date: dateStr });
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Notice recorded');
      router.back();
    } catch (err) {
      Alert.alert('Could not record notice', getApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Give notice',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, marginBottom: space.md }}>
          <Text style={{ color: colors.text, fontSize: fontSize.h2, fontWeight: fontWeight.extrabold }}>
            Move out
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
            30-day notice
          </Text>
        </View>

        {/* Tint explainer */}
        <View
          style={{
            backgroundColor: tooSoon && !invalid ? colors.warningBg : colors.surfaceMuted,
            borderWidth: 1,
            borderColor: tooSoon && !invalid ? colors.warningBorder : colors.border,
            borderRadius: radius.lg,
            padding: space.lg,
          }}
        >
          <Text
            style={{
              color: tooSoon && !invalid ? colors.warningFg : colors.textMuted,
              fontSize: fontSize.small,
              lineHeight: 20,
            }}
          >
            {invalid
              ? 'Pick a move-out date that is today or later.'
              : tooSoon
                ? `This date is only ${daysNotice} day${daysNotice === 1 ? '' : 's'} away — under the 30-day notice, your refundable advance will not be returned.`
                : `With 30 days' notice the earliest exit is ${format(addDays(new Date(), POLICY_DAYS), 'd MMM yyyy')}, and your advance stays refundable.`}
          </Text>
        </View>

        {/* Move-out date */}
        <SectionCap>MOVE-OUT DATE</SectionCap>
        <Card>
          <Field
            label="Move-out date"
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: -space.sm, marginBottom: space.md }}>
            {invalid ? 'Choose today or a future date.' : `${daysNotice} day${daysNotice === 1 ? '' : 's'} from today`}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {[15, 30, 60].map((d) => (
              <Button
                key={d}
                label={`+${d} days`}
                variant="secondary"
                size="sm"
                onPress={() => setDateStr(format(addDays(new Date(), d), 'yyyy-MM-dd'))}
              />
            ))}
          </View>
        </Card>

        {/* Deposit estimate */}
        <SectionCap>DEPOSIT ESTIMATE</SectionCap>
        <Card>
          {[
            ['Deposit held', rupees(depositPaise)],
            ['Pending dues', rupees(0)],
          ].map(([k, v]) => (
            <View
              key={k}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 7,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{k}</Text>
              <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>{v}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: space.md }}>
            <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
              Estimated refund
            </Text>
            <Text style={{ color: colors.successFg, fontSize: fontSize.h3, fontWeight: fontWeight.extrabold }}>
              {rupees(refundPaise)}
            </Text>
          </View>
          <Text style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: space.sm }}>
            Final after room inspection · paid within 7 days of exit.
          </Text>
        </Card>

        <View style={{ height: space.lg }} />
        <Button
          label="Submit notice"
          onPress={submit}
          loading={submitting}
          disabled={invalid}
          size="lg"
          variant={tooSoon ? 'danger' : 'primary'}
          block
        />
        <Text style={{ color: colors.textDim, fontSize: fontSize.caption, textAlign: 'center', marginTop: space.sm }}>
          You can talk to the manager first — nothing is final until you submit.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function SectionCap({ children }: { children: React.ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        marginTop: space.xl,
        marginBottom: space.sm,
      }}
    >
      {children}
    </Text>
  );
}
