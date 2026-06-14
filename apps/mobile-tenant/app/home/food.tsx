/**
 * Food tab — renders the menu the owner uploaded via the admin webapp.
 *
 *   - PDF mode → "Open weekly menu" button → opens in the system PDF viewer
 *     (or the in-app browser via Linking.openURL).
 *   - Image mode → inline image preview, tap to zoom.
 *   - Empty state → friendly nudge pointing to the owner.
 *
 * Below the menu file, this week's slot-by-slot meal cards are seeded
 * from the mock dataset for now. They become opt-in/out controls in a
 * follow-up phase (we'd need a `meal_preferences` table on the backend).
 */
import { useMemo } from 'react';
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import {
  Card,
  Empty,
  ErrorState,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  SkeletonLines,
  toast,
} from '../../components/ui';
import {
  useCurrentMenu,
  useMealsThisWeek,
  type CurrentMenuResponse,
} from '../../lib/data/hooks';
import type { MealServing } from '../../lib/data/types';
import { useTheme } from '../../lib/theme';

const SLOT_LABEL: Record<MealServing['slot'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const SLOT_ICON: Record<MealServing['slot'], 'cafe' | 'fast-food' | 'restaurant'> = {
  breakfast: 'cafe',
  lunch: 'fast-food',
  dinner: 'restaurant',
};

export default function FoodScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const { width } = useWindowDimensions();

  const menuQ = useCurrentMenu();
  const mealsQ = useMealsThisWeek();

  const weekDays = useMemo(() => groupMealsByDay(mealsQ.data ?? []), [mealsQ.data]);

  async function openFile() {
    if (!menuQ.data?.url) return;
    try {
      await Linking.openURL(menuQ.data.url);
    } catch {
      toast.error('Could not open the menu.');
    }
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={menuQ.isFetching || mealsQ.isFetching}
            onRefresh={() => {
              menuQ.refetch();
              mealsQ.refetch();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={{ marginTop: space.md, marginBottom: space.lg }}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.h1,
              lineHeight: lineHeight.h1,
              fontWeight: fontWeight.extrabold,
            }}
          >
            Food
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: fontSize.body, marginTop: 2 }}
          >
            Weekly menu + your meal preferences
          </Text>
        </View>

        {/* Weekly menu (owner-uploaded file) */}
        {menuQ.isLoading ? (
          <Card variant="hero">
            <SkeletonLines count={4} />
          </Card>
        ) : menuQ.error ? (
          <ErrorState
            title="Couldn't load the menu"
            message="Pull down to retry."
            onRetry={() => menuQ.refetch()}
          />
        ) : menuQ.data ? (
          <MenuFileCard menu={menuQ.data} screenWidth={width} onOpen={openFile} />
        ) : (
          <Empty
            iconName="restaurant"
            title="No menu posted yet"
            message="Your PG manager will upload the weekly menu soon. Pull down to check again."
          />
        )}

        {/* Daily meal slots (mock seed for now — opt-in/out lands later) */}
        <SectionHeader title="This week" subtitle="What's served day by day" />
        {mealsQ.isLoading ? (
          <SkeletonLines count={4} />
        ) : weekDays.length === 0 ? (
          <Empty iconName="calendar" title="No meals scheduled" />
        ) : (
          <View style={{ gap: space.lg }}>
            {weekDays.map((day) => (
              <View key={day.dateStr}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    marginBottom: space.sm,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fontSize.bodyLg,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {day.label}
                  </Text>
                  {day.isToday ? (
                    <Pill label="Today" tone="accent" size="sm" />
                  ) : null}
                </View>
                <Card style={{ padding: 0 }}>
                  {day.servings.map((s, i) => (
                    <View key={`${s.slot}-${i}`}>
                      <MealRow serving={s} />
                      {i < day.servings.length - 1 ? (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: colors.border,
                            marginHorizontal: space.lg,
                          }}
                        />
                      ) : null}
                    </View>
                  ))}
                </Card>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function MenuFileCard({
  menu,
  screenWidth,
  onOpen,
}: {
  menu: CurrentMenuResponse;
  screenWidth: number;
  onOpen: () => void;
}) {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const isImage = menu.content_type.startsWith('image/');
  const imgWidth = screenWidth - space.lg * 2 - space.xl * 2;
  return (
    <Card variant="hero">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
        }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            fontWeight: fontWeight.semibold,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Week of {format(parseISO(menu.week_start_date), 'd MMM')}
        </Text>
        {menu.is_current_week ? (
          <Pill label="Current" tone="success" size="sm" />
        ) : (
          <Pill label="Last week" tone="warning" size="sm" />
        )}
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize.h2,
          lineHeight: lineHeight.h2,
          fontWeight: fontWeight.extrabold,
        }}
      >
        {menu.title ?? "This week's menu"}
      </Text>

      {isImage ? (
        <Pressable onPress={onOpen} style={{ marginTop: space.lg }}>
          <Image
            source={{ uri: menu.url }}
            style={{
              width: imgWidth,
              height: imgWidth,
              borderRadius: radius.lg,
              backgroundColor: colors.surfaceMuted,
            }}
            resizeMode="cover"
          />
        </Pressable>
      ) : (
        <View
          style={{
            marginTop: space.lg,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.lg,
            padding: space['3xl'],
            alignItems: 'center',
          }}
        >
          <Ionicons name="document-text" size={48} color={colors.accent} />
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.body,
              fontWeight: fontWeight.semibold,
              marginTop: space.md,
            }}
          >
            PDF menu
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              marginTop: 2,
              textAlign: 'center',
            }}
          >
            Tap below to open in your viewer.
          </Text>
        </View>
      )}

      <Pressable
        onPress={onOpen}
        style={{
          backgroundColor: colors.accent,
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          marginTop: space.lg,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: space.sm,
        }}
      >
        <Ionicons name="open" size={18} color={colors.onAccent} />
        <Text
          style={{
            color: colors.onAccent,
            fontSize: fontSize.body,
            fontWeight: fontWeight.bold,
          }}
        >
          Open full menu
        </Text>
      </Pressable>
    </Card>
  );
}

function MealRow({ serving }: { serving: MealServing }) {
  const { colors, fontSize, fontWeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: space.lg,
        gap: space.md,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={SLOT_ICON[serving.slot]} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text
            style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
          >
            {SLOT_LABEL[serving.slot]}
          </Text>
          {serving.optedIn ? (
            <Pill label="Opted in" tone="success" size="sm" />
          ) : (
            <Pill label="Skipping" tone="neutral" size="sm" />
          )}
        </View>
        <Text
          style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
          numberOfLines={3}
        >
          {serving.items.map((i) => i.name).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function groupMealsByDay(meals: MealServing[]) {
  const byDate: Record<string, MealServing[]> = {};
  for (const m of meals) {
    const ds = m.date.slice(0, 10);
    byDate[ds] = byDate[ds] ?? [];
    byDate[ds].push(m);
  }
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return Object.entries(byDate)
    .filter(([d]) => d >= todayStr)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dateStr, servings]) => ({
      dateStr,
      label: format(parseISO(dateStr), 'EEEE, d MMM'),
      isToday: dateStr === todayStr,
      servings: servings.sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot)),
    }))
    .slice(0, 5);
}

function slotIndex(s: MealServing['slot']): number {
  return s === 'breakfast' ? 0 : s === 'lunch' ? 1 : 2;
}
