/**
 * Resident app bottom tabs — Home · Pay · Stay · Food · More.
 * Sits under /tenant-portal so the OTP login (index.tsx) gates it; route
 * groups keep the URLs clean (/tenant-portal/home, …). Forest active tint,
 * Ionicons (not the mock's raw SVGs) per the icon note.
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: IoniconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function TenantTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.borderSoft,
          backgroundColor: colors.surface,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="pay" options={{ title: 'Pay', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="stay" options={{ title: 'Stay', tabBarIcon: icon('bed-outline') }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: icon('restaurant-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
