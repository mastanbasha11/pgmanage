/**
 * Resident-app navigator: the OTP login (index) and the help detail screen are
 * plain stack screens; the signed-in app lives in the (tabs) group.
 */
import { Stack } from 'expo-router';

export default function TenantPortalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="help" />
    </Stack>
  );
}
