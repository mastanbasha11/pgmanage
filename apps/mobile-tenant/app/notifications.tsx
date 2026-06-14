/**
 * In-app notification center.
 */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';

import { Card, Empty, Pressable, Screen, SkeletonLines } from '../components/ui';
import { useNotifications } from '../lib/data/hooks';
import type { AppNotification, NotificationKind } from '../lib/data/types';
import { useTheme } from '../lib/theme';

const KIND_ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  rent_due: 'card',
  rent_paid: 'checkmark-circle',
  ticket_update: 'construct',
  referral_credit: 'gift',
  event: 'calendar',
  notice: 'megaphone',
  visitor: 'people',
  food: 'restaurant',
};

const KIND_COLOR: Record<NotificationKind, 'warningFg' | 'successFg' | 'infoFg' | 'celebrationFg' | 'accent'> = {
  rent_due: 'warningFg',
  rent_paid: 'successFg',
  ticket_update: 'infoFg',
  referral_credit: 'celebrationFg',
  event: 'accent',
  notice: 'warningFg',
  visitor: 'infoFg',
  food: 'accent',
};

export default function NotificationsScreen() {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  const notifQ = useNotifications();
  // Local read state — server-side read tracking is a Phase 9.1 follow-up.
  const [readLocal, setReadLocal] = useState<Record<string, true>>({});

  function markRead(id: string) {
    setReadLocal((m) => ({ ...m, [id]: true }));
  }

  const all = notifQ.data ?? [];
  const items = all.map((n) => ({ ...n, read: n.read || !!readLocal[n.id] }));

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {notifQ.isLoading ? (
          <SkeletonLines count={5} />
        ) : items.length === 0 ? (
          <Empty
            iconName="notifications-off"
            title="All caught up"
            message="You don't have any notifications right now."
          />
        ) : (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {items.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onPress={() => markRead(n.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();
  const iconName = KIND_ICON[notification.kind];
  const colorKey = KIND_COLOR[notification.kind];
  const tint = colors[colorKey];
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          backgroundColor: notification.read ? colors.surface : colors.accentSoft,
          borderColor: notification.read ? colors.border : colors.accentBorder,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.lg,
          flexDirection: 'row',
          gap: space.md,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={iconName} size={18} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}
          >
            {notification.title}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
            {notification.message}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: 6 }}>
            {formatDistanceToNow(parseISO(notification.at))} ago
          </Text>
        </View>
        {!notification.read ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 }} />
        ) : null}
      </View>
    </Pressable>
  );
}
