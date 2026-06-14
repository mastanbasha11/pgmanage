/**
 * More tab — grid of secondary destinations.
 *
 * Everything that doesn't earn a permanent bottom-tab slot lives here:
 * Visitors, Safety, Community, Referrals, Notices, Notifications,
 * Support, Feedback, Profile, Settings, Sign out.
 */
import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
  Card,
  Pill,
  Pressable,
  Screen,
  SectionHeader,
  toast,
} from '../../components/ui';
import { useNotifications, useProfile } from '../../lib/data/hooks';
import { secureStorage } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';

interface Item {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  to: string;
  badge?: number;
  external?: boolean;
}

export default function MoreScreen() {
  const router = useRouter();
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const profileQ = useProfile();
  const notificationsQ = useNotifications();

  const profile = profileQ.data;
  const unreadCount = (notificationsQ.data ?? []).filter((n) => !n.read).length;

  async function signOut() {
    await secureStorage.clear();
    useAppStore.getState().signOut();
    router.replace('/auth/login');
  }

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Stay',
      items: [
        { label: 'Visitors', icon: 'people', to: '/visitors' },
        { label: 'Safety', icon: 'shield-checkmark', to: '/safety' },
        { label: 'Notice to vacate', icon: 'exit', to: '/notice' },
      ],
    },
    {
      title: 'Community',
      items: [
        { label: 'Community', icon: 'sparkles', to: '/community' },
        { label: 'Refer & earn', icon: 'gift', to: '/referral' },
      ],
    },
    {
      title: 'Updates',
      items: [
        { label: 'Notifications', icon: 'notifications', to: '/notifications', badge: unreadCount },
        { label: 'Notices', icon: 'megaphone', to: '/notices' },
      ],
    },
    {
      title: 'Help',
      items: [
        { label: 'Support', icon: 'help-circle', to: '/support' },
        { label: 'Feedback', icon: 'chatbubble-ellipses', to: '/feedback' },
      ],
    },
    {
      title: 'You',
      items: [
        { label: 'Profile', icon: 'person', to: '/profile' },
        { label: 'Settings', icon: 'settings', to: '/settings' },
      ],
    },
  ];

  return (
    <Screen scroll>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profile snapshot at top */}
        {profile ? (
          <Pressable onPress={() => router.push('/profile')}>
            <Card variant="hero" style={{ marginTop: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={profile.name} size={56} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fontSize.h3,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {profile.name}
                  </Text>
                  <Text
                    style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}
                  >
                    {profile.property.name} · Room {profile.room.roomNumber}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </View>
            </Card>
          </Pressable>
        ) : null}

        {/* Groups */}
        {groups.map((g) => (
          <View key={g.title}>
            <SectionHeader title={g.title} />
            <Card style={{ padding: 0 }}>
              {g.items.map((item, i) => (
                <View key={item.label}>
                  <Pressable
                    onPress={() => {
                      if (item.external) Linking.openURL(item.to);
                      else router.push(item.to as never);
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: space.lg,
                        gap: space.md,
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
                        <Ionicons name={item.icon} size={18} color={colors.accent} />
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          color: colors.text,
                          fontSize: fontSize.body,
                          fontWeight: fontWeight.semibold,
                        }}
                      >
                        {item.label}
                      </Text>
                      {item.badge && item.badge > 0 ? (
                        <Pill
                          label={String(item.badge)}
                          tone="danger"
                          size="sm"
                        />
                      ) : null}
                      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                    </View>
                  </Pressable>
                  {i < g.items.length - 1 ? (
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

        {/* Sign out */}
        <View style={{ marginTop: space['3xl'] }}>
          <Pressable onPress={signOut} hitSlop={8}>
            <View
              style={{
                paddingVertical: space.md,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: colors.dangerFg,
                  fontSize: fontSize.body,
                  fontWeight: fontWeight.bold,
                }}
              >
                Sign out
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
