/**
 * Community — events + resident directory + partner offers.
 */
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Avatar,
  Card,
  Empty,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
  toast,
} from '../components/ui';
import {
  useEvents,
  usePartnerOffers,
  useResidentDirectory,
} from '../lib/data/hooks';
import { useTheme } from '../lib/theme';

export default function CommunityScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const eventsQ = useEvents();
  const residentsQ = useResidentDirectory();
  const partnersQ = usePartnerOffers();

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Community',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Events */}
        <SectionHeader title="Upcoming events" />
        {eventsQ.isLoading ? (
          <SkeletonLines count={3} />
        ) : !eventsQ.data?.length ? (
          <Empty iconName="calendar" title="No events scheduled" />
        ) : (
          <View style={{ gap: space.md }}>
            {eventsQ.data.map((e) => (
              <Card key={e.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    marginBottom: space.sm,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: colors.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="calendar" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
                    >
                      {e.title}
                    </Text>
                    <Text
                      style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
                    >
                      {format(parseISO(e.startsAt), 'EEE, d MMM · h:mm a')} · {e.location}
                    </Text>
                  </View>
                </View>
                {e.description ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: fontSize.small,
                      lineHeight: lineHeight.small,
                      marginBottom: space.sm,
                    }}
                  >
                    {e.description}
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: colors.textDim, fontSize: fontSize.caption }}>
                    {e.attendeeCount} going
                  </Text>
                  <Pressable
                    onPress={() =>
                      toast.success(e.rsvpd ? 'RSVP removed' : "You're going")
                    }
                    style={{
                      backgroundColor: e.rsvpd ? colors.successBg : colors.accent,
                      borderColor: e.rsvpd ? colors.successFg : colors.accent,
                      borderWidth: 1,
                      borderRadius: radius.pill,
                      paddingHorizontal: space.lg,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: e.rsvpd ? colors.successFg : colors.onAccent,
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      {e.rsvpd ? 'Going' : 'RSVP'}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Residents */}
        <SectionHeader title="Your neighbours" subtitle="Say hi" />
        {residentsQ.isLoading ? (
          <SkeletonLines count={3} />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
            {(residentsQ.data ?? []).map((r) => (
              <Card key={r.id} variant="flat" style={{ flexBasis: '47%', flexGrow: 1 }}>
                <View style={{ alignItems: 'center', gap: space.sm }}>
                  <Avatar name={r.name} size={56} />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fontSize.body,
                      fontWeight: fontWeight.bold,
                      textAlign: 'center',
                    }}
                  >
                    {r.name}
                  </Text>
                  {r.bio ? (
                    <Text
                      numberOfLines={2}
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.caption,
                        textAlign: 'center',
                      }}
                    >
                      {r.bio}
                    </Text>
                  ) : null}
                  {r.interests.length ? (
                    <View
                      style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}
                    >
                      {r.interests.slice(0, 2).map((i) => (
                        <Pill key={i} label={i} tone="accent" size="sm" />
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Partner offers */}
        <SectionHeader title="Resident perks" subtitle="Partner discounts" />
        {partnersQ.isLoading ? (
          <SkeletonLines count={3} />
        ) : (
          <View style={{ gap: space.md }}>
            {(partnersQ.data ?? []).map((p) => (
              <Card key={p.id}>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.celebrationBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="pricetag" size={20} color={colors.celebrationFg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: fontSize.body,
                          fontWeight: fontWeight.bold,
                        }}
                      >
                        {p.partnerName}
                      </Text>
                      <Pill label={p.category} tone="accent" size="sm" />
                    </View>
                    <Text
                      style={{
                        color: colors.celebrationFg,
                        fontSize: fontSize.body,
                        fontWeight: fontWeight.bold,
                        marginTop: space.xs,
                      }}
                    >
                      {p.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.small,
                        marginTop: 2,
                      }}
                    >
                      {p.description}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
