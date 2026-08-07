/**
 * My stay — room, lease, what's included, documents & people.
 * Layout matches the resident-app mockup (screen 4): a dark forest room
 * card, an "Included" list, a "Documents & people" list, and a move-out
 * prompt. Wired to the real profile/lease; static rows for included perks.
 */
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import { Card, Money, Pill, Pressable, Screen, SkeletonLines } from '../../components/ui';
import { useProfile } from '../../lib/data/hooks';
import { useTheme } from '../../lib/theme';

const SHARING_LABEL: Record<string, string> = {
  single: 'Single occupancy',
  twin: 'Twin sharing',
  triple: 'Triple sharing',
  quad: 'Quad sharing',
};

export default function StayScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  const profileQ = useProfile();
  const p = profileQ.data;

  if (profileQ.isLoading || !p) {
    return (
      <Screen scroll>
        <View style={{ marginTop: 24 }}>
          <SkeletonLines count={8} />
        </View>
      </Screen>
    );
  }

  const floorName =
    p.room.floor === 0
      ? 'Ground floor'
      : `${p.room.floor}${['th', 'st', 'nd', 'rd'][p.room.floor % 10] ?? 'th'} floor`;
  const tenure = `${format(parseISO(p.lease.startDate), 'dd MMM yy')} – ${
    p.lease.expectedEndDate ? format(parseISO(p.lease.expectedEndDate), 'dd MMM yy') : 'ongoing'
  }`;

  const included = [
    { icon: 'restaurant' as const, title: 'Meals', sub: 'as per the kitchen menu' },
    { icon: 'sparkles' as const, title: 'Housekeeping', sub: 'scheduled cleaning' },
    { icon: 'wifi' as const, title: 'Wi-Fi', sub: 'complimentary — no charge' },
    { icon: 'bulb' as const, title: 'Electricity', sub: 'included in rent' },
  ];
  const docs = [
    { icon: 'document-text' as const, title: 'Agreement & receipts', to: '/home/pay' },
    { icon: 'people' as const, title: 'Staff & house rules', to: '/community' },
    { icon: 'ticket' as const, title: 'Guest passes', to: '/visitors' },
  ];

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: 8, paddingBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.h2, fontWeight: fontWeight.extrabold }}>
          My stay
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          {p.property.name} · {p.property.city}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: space['3xl'] }} showsVerticalScrollIndicator={false}>
        {/* Dark room card */}
        <View
          style={{
            backgroundColor: colors.accent,
            borderRadius: radius.lg,
            padding: space.lg,
            marginTop: space.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: colors.onAccent, fontSize: fontSize.bodyLg, fontWeight: fontWeight.extrabold }}>
                Room {p.room.roomNumber} · Bed {p.room.bedLabel}
              </Text>
              <Text style={{ color: colors.onAccent, opacity: 0.75, fontSize: fontSize.caption, marginTop: 2 }}>
                {SHARING_LABEL[p.room.sharing] ?? p.room.sharing} · {floorName}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderRadius: radius.pill,
                paddingHorizontal: space.md,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: colors.onAccent, fontSize: fontSize.caption, fontWeight: fontWeight.bold }}>
                ₹{Math.round(p.lease.monthlyRentPaise / 100).toLocaleString('en-IN')}/mo
              </Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: space.md }} />
          {[
            ['Tenure', tenure],
            ['Deposit held', `₹${Math.round(p.lease.depositPaise / 100).toLocaleString('en-IN')} · refundable`],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: colors.onAccent, opacity: 0.72, fontSize: fontSize.small }}>{k}</Text>
              <Text style={{ color: colors.onAccent, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Included */}
        <SectionCap>INCLUDED</SectionCap>
        <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
          {included.map((it, i) => (
            <StayRow key={it.title} icon={it.icon} title={it.title} sub={it.sub} last={i === included.length - 1} />
          ))}
        </Card>

        {/* Documents & people */}
        <SectionCap>DOCUMENTS &amp; PEOPLE</SectionCap>
        <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
          {docs.map((it, i) => (
            <StayRow
              key={it.title}
              icon={it.icon}
              title={it.title}
              chevron
              onPress={() => router.push(it.to)}
              last={i === docs.length - 1}
            />
          ))}
        </Card>

        {/* Move out */}
        <Card style={{ marginTop: space.lg }} onPress={() => router.push('/notice')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>
                Planning to move out?
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 }}>
                30-day notice · deposit estimate shown first
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: fontSize.caption, fontWeight: fontWeight.bold }}>Start</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function SectionCap({ children }: { children: React.ReactNode }) {
  const { colors, fontSize, space } = useTheme();
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

function StayRow({
  icon,
  title,
  sub,
  chevron,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>{title}</Text>
        {sub ? (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 1 }}>{sub}</Text>
        ) : null}
      </View>
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textDim} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {inner}
    </Pressable>
  ) : (
    inner
  );
}
