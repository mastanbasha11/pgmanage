import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// @expo/vector-icons ships with Expo (no extra native dep / react-native-svg needed).
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const icon = (name: IoniconName) =>
    ({ color }: { color: string }) => <Ionicons name={name} size={22} color={color} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0D9488', // brand teal
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          backgroundColor: '#fff',
          paddingBottom: 4,
        },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="rooms" options={{ title: 'Rooms', tabBarIcon: icon('bed-outline') }} />
      <Tabs.Screen name="tenants" options={{ title: 'Tenants', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="rent" options={{ title: 'Rent', tabBarIcon: icon('cash-outline') }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
    </Tabs>
  );
}
