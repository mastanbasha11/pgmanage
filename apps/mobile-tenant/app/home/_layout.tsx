/**
 * Bottom-tab navigator. The five tabs (Home / Pay / Food / Services /
 * More) carry the whole post-login surface. Detail screens (ticket
 * detail, notice flow, profile edit, etc.) live at the app/ root and
 * are pushed via router.push; that automatically hides the tab bar so
 * detail screens feel modal-like.
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme';

export default function HomeTabsLayout() {
  const { colors, fontWeight, fontSize } = useTheme();
  // Extend the bar into the bottom safe area so tab labels are never clipped
  // by the Android system navigation bar (gesture or 3-button).
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
          height: 64 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.caption,
          fontWeight: fontWeight.semibold,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: 'Food',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stay"
        options={{
          title: 'Stay',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bed-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
      {/* Services (raise complaints) is reached from the Home "Help" tile,
          not a bottom-tab slot — kept routable, hidden from the bar. */}
      <Tabs.Screen name="services" options={{ href: null }} />
    </Tabs>
  );
}
