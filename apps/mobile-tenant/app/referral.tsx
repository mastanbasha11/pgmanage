/**
 * Refer & earn — hero card, earnings tiles, transparent pipeline.
 *
 * The Stanza-better differentiator: every referral row shows exactly
 * where in the pipeline the friend is (Invited → Signed up → Moved in
 * → Bonus credited) with timestamps + the bonus amount per stage. The
 * user never has to ask "where is my reward?".
 *
 * Share sheet opens the OS share UI which surfaces WhatsApp / SMS /
 * Email / Copy automatically.
 */
import { Share, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Avatar,
  Button,
  Card,
  Money,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
  toast,
} from '../components/ui';
import { useReferrals, useReferralSummary } from '../lib/data/hooks';
import type { Referral, ReferralStage } from '../lib/data/types';
import { useTheme } from '../lib/theme';

const STAGE_LABEL: Record<ReferralStage, string> = {
  invited: 'Invited',
  signed_up: 'Signed up',
  moved_in: 'Moved in',
  bonus_credited: 'Bonus credited',
};

const STAGE_ORDER: ReferralStage[] = ['invited', 'signed_up', 'moved_in', 'bonus_credited'];

const STAGE_TONE: Record<ReferralStage, 'info' | 'success' | 'celebration'> = {
  invited: 'info',
  signed_up: 'info',
  moved_in: 'success',
  bonus_credited: 'celebration',
};

export default function ReferralScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const summaryQ = useReferralSummary();
  const refsQ = useReferrals();

  const summary = summaryQ.data;
  const refs = refsQ.data ?? [];

  async function share() {
    if (!summary) return;
    const msg =
      `Move into ${summary.code.startsWith('ADITYA') ? 'Sunrise Residency' : 'my PG'} ` +
      `and we both earn rewards! Use my code ${summary.code} or sign up here: ${summary.shareUrl}`;
    try {
      const result = await Share.share({ message: msg, url: summary.shareUrl });
      if (result.action === Share.sharedAction) {
        toast.success('Shared');
      }
    } catch {
      toast.error('Could not open share sheet');
    }
  }

  if (summaryQ.isLoading || !summary) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Refer & earn', headerStyle: { backgroundColor: colors.bg }, headerTitleStyle: { color: colors.text }, headerTintColor: colors.text }} />
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={6} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Refer & earn',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero card */}
        <Card
          variant="hero"
          style={{
            marginTop: space.md,
            backgroundColor: colors.celebrationBg,
            borderColor: colors.celebrationFg,
            borderWidth: 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.celebrationFg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="gift" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.celebrationFg,
                  fontSize: fontSize.small,
                  fontWeight: fontWeight.bold,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Refer & earn
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.h1,
                  lineHeight: lineHeight.h1,
                  fontWeight: fontWeight.extrabold,
                }}
              >
                Up to{' '}
              </Text>
              <Money
                paise={summary.bonusPerSignupPaise + summary.bonusPerMoveInPaise}
                size="display"
                color={colors.celebrationFg}
              />
            </View>
          </View>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.body,
              lineHeight: lineHeight.body,
              marginTop: space.lg,
            }}
          >
            Help a friend become a resident, and we'll add ₹500 when they sign up plus ₹2,000 when they move in — straight to your wallet.
          </Text>

          {/* Code chip */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: space.lg,
              marginTop: space.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: fontSize.caption,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontWeight: fontWeight.semibold,
                }}
              >
                Your code
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.h2,
                  fontWeight: fontWeight.extrabold,
                  letterSpacing: 2,
                  marginTop: 2,
                }}
              >
                {summary.code}
              </Text>
            </View>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel="Share code"
              style={{
                backgroundColor: colors.celebrationFg,
                paddingHorizontal: space.lg,
                paddingVertical: 10,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
              }}
            >
              <Ionicons name="share-social" size={16} color="#FFFFFF" />
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: fontSize.small,
                  fontWeight: fontWeight.bold,
                }}
              >
                Share
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Earnings tiles */}
        <SectionHeader title="Your earnings" />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <KpiTile
            label="Earned"
            paise={summary.totalEarnedPaise}
            tone={colors.celebrationFg}
            iconName="trophy"
          />
          <KpiTile
            label="In wallet"
            paise={summary.creditedToWalletPaise}
            tone={colors.successFg}
            iconName="wallet"
          />
          <KpiTile
            label="Pending"
            paise={summary.pendingPaise}
            tone={colors.warningFg}
            iconName="hourglass"
          />
        </View>

        {/* How it works */}
        <SectionHeader title="How it works" />
        <Card>
          <Step num={1} icon="share-social" label="Share your code" body="Send via WhatsApp, SMS, or any chat app." />
          <Step num={2} icon="person-add" label="They sign up" body={`You both get ₹${Math.round(summary.bonusPerSignupPaise / 100)}.`} />
          <Step num={3} icon="home" label="They move in" body={`Another ₹${Math.round(summary.bonusPerMoveInPaise / 100)} lands in your wallet.`} />
        </Card>

        {/* Pipeline */}
        <SectionHeader
          title="Your referrals"
          subtitle={`${refs.length} ${refs.length === 1 ? 'friend' : 'friends'}`}
        />
        {refsQ.isLoading ? (
          <SkeletonLines count={3} />
        ) : refs.length === 0 ? (
          <Card variant="flat">
            <Text style={{ color: colors.textMuted, fontSize: fontSize.body, textAlign: 'center' }}>
              No referrals yet. Share your code to get started.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: space.md }}>
            {refs.map((r) => (
              <ReferralCard key={r.id} referral={r} />
            ))}
          </View>
        )}

        <View style={{ height: space.lg }} />
        <Button label="Share my code" onPress={share} iconName="share-social" size="lg" block />
      </ScrollView>
    </Screen>
  );
}

function KpiTile({
  label,
  paise,
  tone,
  iconName,
}: {
  label: string;
  paise: number;
  tone: string;
  iconName: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        gap: space.xs,
      }}
    >
      <Ionicons name={iconName} size={18} color={tone} />
      <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, fontWeight: fontWeight.semibold }}>
        {label}
      </Text>
      <Money paise={paise} size="h3" color={tone} compact={paise >= 100000} />
    </View>
  );
}

function Step({ num, icon, label, body }: { num: number; icon: keyof typeof Ionicons.glyphMap; label: string; body: string }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.celebrationBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={16} color={colors.celebrationFg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
          {num}. {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  );
}

function ReferralCard({ referral }: { referral: Referral }) {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  const currentIdx = STAGE_ORDER.indexOf(referral.stage);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
        <Avatar name={referral.friendName} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
            {referral.friendName}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
            Invited {format(parseISO(referral.invitedAt), 'd MMM')}
          </Text>
        </View>
        <Money paise={referral.totalBonusPaise} size="body" weight="bold" />
      </View>

      {/* Pipeline */}
      <View>
        {STAGE_ORDER.map((stage, i) => {
          const reached = i <= currentIdx;
          const event = referral.stageHistory.find((e) => e.stage === stage);
          const isLast = i === STAGE_ORDER.length - 1;
          return (
            <View key={stage} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ alignItems: 'center', width: 18 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: reached ? colors.celebrationFg : colors.border,
                    marginTop: 4,
                  }}
                />
                {!isLast ? (
                  <View
                    style={{
                      flex: 1,
                      width: 2,
                      backgroundColor: reached ? colors.celebrationFg : colors.border,
                    }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: isLast ? 0 : space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text
                    style={{
                      color: reached ? colors.text : colors.textDim,
                      fontSize: fontSize.small,
                      fontWeight: fontWeight.semibold,
                    }}
                  >
                    {STAGE_LABEL[stage]}
                  </Text>
                  {event?.bonusPaise ? (
                    <Pill label={`+₹${Math.round(event.bonusPaise / 100)}`} tone={STAGE_TONE[stage]} size="sm" />
                  ) : null}
                </View>
                {event ? (
                  <Text style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: 1 }}>
                    {format(parseISO(event.at), 'd MMM yyyy')}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
