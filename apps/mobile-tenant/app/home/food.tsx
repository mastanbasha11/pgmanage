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
import { useMemo, useState } from 'react';
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

const SLOT_TIME: Record<MealServing['slot'], string> = {
  breakfast: '7:30 – 9:30',
  lunch: '12:30 – 2:30',
  dinner: '7:30 – 9:30',
};

function currentSlot(): MealServing['slot'] {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}

export default function FoodScreen() {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  const { width } = useWindowDimensions();

  const menuQ = useCurrentMenu();
  const mealsQ = useMealsThisWeek();

  const weekDays = useMemo(() => groupMealsByDay(mealsQ.data ?? []), [mealsQ.data]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const day = weekDays[selectedIdx] ?? weekDays[0];
  const nowSlot = currentSlot();

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
      {/* Header */}
      <View style={{ paddingTop: 8, paddingBottom: space.sm }}>
        <Text style={{ color: colors.text, fontSize: fontSize.h2, fontWeight: fontWeight.extrabold }}>
          Food
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          weekly menu · set by the kitchen
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
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
        {/* Day tabs */}
        {weekDays.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              gap: space.lg,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingBottom: space.sm,
              marginTop: space.sm,
            }}
          >
            {weekDays.map((d, i) => {
              const on = i === selectedIdx;
              return (
                <Pressable key={d.dateStr} onPress={() => setSelectedIdx(i)} hitSlop={6}>
                  <View style={{ paddingBottom: 6 }}>
                    <Text
                      style={{
                        color: on ? colors.accent : colors.textDim,
                        fontSize: fontSize.small,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      {d.short}
                    </Text>
                    {on ? (
                      <View
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: -space.sm - 1,
                          height: 2.5,
                          borderRadius: 2,
                          backgroundColor: colors.accent,
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Selected day's meals */}
        {mealsQ.isLoading ? (
          <View style={{ marginTop: space.lg }}>
            <SkeletonLines count={4} />
          </View>
        ) : !day ? (
          <View style={{ marginTop: space.lg }}>
            <Empty iconName="calendar" title="No meals scheduled" />
          </View>
        ) : (
          <View style={{ marginTop: space.lg, gap: space.md }}>
            {day.servings.map((s, i) => (
              <MealCard key={`${s.slot}-${i}`} serving={s} upNext={day.isToday && s.slot === nowSlot} />
            ))}
          </View>
        )}

        <Text
          style={{
            color: colors.textDim,
            fontSize: fontSize.caption,
            textAlign: 'center',
            marginTop: space.lg,
            lineHeight: 18,
          }}
        >
          Menu is view-only for now.{'\n'}Meal choice &amp; skip are on the roadmap.
        </Text>

        {/* Owner-uploaded full menu (PDF / image) — kept as a feature */}
        {menuQ.data ? (
          <Pressable
            onPress={openFile}
            style={{
              marginTop: space.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: space.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
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
              <Ionicons name="document-text-outline" size={17} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: fontWeight.bold }}>
                Open full weekly menu
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 1 }}>
                {menuQ.data.content_type.startsWith('image/') ? 'image' : 'PDF'} · posted by the kitchen
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function MealCard({ serving, upNext }: { serving: MealServing; upNext?: boolean }) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: space.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
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
            <Ionicons name={SLOT_ICON[serving.slot]} size={17} color={colors.accent} />
          </View>
          <View>
            <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
              {SLOT_LABEL[serving.slot]}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 1 }}>
              {SLOT_TIME[serving.slot]}
            </Text>
          </View>
        </View>
        {upNext ? <Pill label="up next" tone="accent" size="sm" /> : null}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: space.md, lineHeight: 20 }}>
        {serving.items.map((i) => i.name).join(', ')}
      </Text>
    </View>
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
      short: dateStr === todayStr ? 'Today' : format(parseISO(dateStr), 'EEE'),
      isToday: dateStr === todayStr,
      servings: servings.sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot)),
    }))
    .slice(0, 6);
}

function slotIndex(s: MealServing['slot']): number {
  return s === 'breakfast' ? 0 : s === 'lunch' ? 1 : 2;
}
