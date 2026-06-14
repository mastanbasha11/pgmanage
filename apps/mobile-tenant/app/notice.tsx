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

import { Button, Card, Field, Pill, Screen, toast } from '../components/ui';
import { api, getApiError } from '../lib/api';
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

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ marginTop: space.md, marginBottom: space.lg }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
            }}
          >
            Moving out?
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.body,
              lineHeight: lineHeight.body,
              marginTop: space.sm,
            }}
          >
            Pick your intended move-out date. We'll let your PG manager know.
          </Text>
        </View>

        <Card>
          <Field
            label="Move-out date"
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              marginTop: -space.sm,
              marginBottom: space.md,
            }}
          >
            {invalid
              ? 'Choose today or a future date.'
              : `${daysNotice} day${daysNotice === 1 ? '' : 's'} from today`}
          </Text>

          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {[15, 30, 60].map((d) => (
              <Button
                key={d}
                label={`+${d} days`}
                variant="secondary"
                size="sm"
                onPress={() =>
                  setDateStr(format(addDays(new Date(), d), 'yyyy-MM-dd'))
                }
              />
            ))}
          </View>
        </Card>

        {/* Policy explainer */}
        <Card
          style={{
            marginTop: space.lg,
            backgroundColor: tooSoon && !invalid ? colors.warningBg : colors.successBg,
            borderColor: tooSoon && !invalid ? colors.warningBorder : colors.successBorder,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
            <Ionicons
              name={tooSoon && !invalid ? 'warning' : 'shield-checkmark'}
              size={22}
              color={tooSoon && !invalid ? colors.warningFg : colors.successFg}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: tooSoon && !invalid ? colors.warningFg : colors.successFg,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.bold,
                }}
              >
                {tooSoon && !invalid
                  ? 'Advance won\'t be refunded'
                  : 'Advance will be refunded'}
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.small,
                  lineHeight: lineHeight.small,
                  marginTop: space.xs,
                }}
              >
                The PG's policy requires at least 30 days' notice for the
                refundable advance to be returned. Move-outs with less than
                30 days' notice forfeit it.
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ height: space.xl }} />

        <Button
          label="Confirm notice"
          onPress={submit}
          loading={submitting}
          disabled={invalid}
          size="lg"
          iconName="exit"
          variant={tooSoon ? 'danger' : 'primary'}
          block
        />
      </ScrollView>
    </Screen>
  );
}
