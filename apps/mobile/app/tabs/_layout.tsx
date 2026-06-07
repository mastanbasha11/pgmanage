/**
 * Bottom tab bar. 5 destinations:
 *   - index    Home (Dashboard)
 *   - tenants  Residents
 *   - rent     Rent + payment collection
 *   - rooms    Vacancies (available + upcoming)
 *   - more     Settings (Simple Mode, language, sign out)
 *
 * Labels are translated via i18n.t() so the bar adapts to Hindi/Telugu
 * the moment the user changes language.
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { t } from '../../lib/i18n';
import { colors, TOUCH_TARGET } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const icon = (name: IoniconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Ionicons name={name} size={size} color={color} />
    );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          height: TOUCH_TARGET + 16,
          paddingTop: 4,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.dashboard'), tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="tenants" options={{ title: t('tab.residents'), tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="rent" options={{ title: t('tab.rent'), tabBarIcon: icon('cash-outline') }} />
      <Tabs.Screen name="rooms" options={{ title: t('tab.rooms'), tabBarIcon: icon('bed-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('tab.more'), tabBarIcon: icon('settings-outline') }} />
      {/* Expenses placeholder is not surfaced in the bar in v1 — file still
          exists so route lookups don't break if linked from elsewhere. */}
      <Tabs.Screen name="expenses" options={{ href: null }} />
    </Tabs>
  );
}
