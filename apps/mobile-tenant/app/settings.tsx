/**
 * Settings — language + theme.
 */
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Card, Pressable, Screen, SectionHeader, toast } from '../components/ui';
import { setLocale, type Locale } from '../lib/i18n';
import { useTheme, useThemeStore, type ThemePreference } from '../lib/theme';

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'te', label: 'తెలుగు' },
];

const THEMES: { code: ThemePreference; label: string; icon: 'phone-portrait' | 'sunny' | 'moon' }[] = [
  { code: 'system', label: 'Use system', icon: 'phone-portrait' },
  { code: 'light', label: 'Light', icon: 'sunny' },
  { code: 'dark', label: 'Dark', icon: 'moon' },
];

export default function SettingsScreen() {
  const { colors, fontSize, fontWeight, lineHeight, radius, space } = useTheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <SectionHeader title="Appearance" />
        <Card style={{ padding: 0 }}>
          {THEMES.map((t, i) => (
            <View key={t.code}>
              <Pressable
                onPress={() => {
                  setPreference(t.code);
                  toast.info(`${t.label} mode`);
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
                    <Ionicons name={t.icon} size={18} color={colors.accent} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: fontSize.body,
                      fontWeight: fontWeight.semibold,
                    }}
                  >
                    {t.label}
                  </Text>
                  {preference === t.code ? (
                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                  ) : null}
                </View>
              </Pressable>
              {i < THEMES.length - 1 ? (
                <View
                  style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
                />
              ) : null}
            </View>
          ))}
        </Card>

        <SectionHeader title="Language" />
        <Card style={{ padding: 0 }}>
          {LANGUAGES.map((l, i) => (
            <View key={l.code}>
              <Pressable
                onPress={() => {
                  setLocale(l.code);
                  toast.info(`Language set to ${l.label}`);
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
                    <Ionicons name="language" size={18} color={colors.accent} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: fontSize.body,
                      fontWeight: fontWeight.semibold,
                    }}
                  >
                    {l.label}
                  </Text>
                </View>
              </Pressable>
              {i < LANGUAGES.length - 1 ? (
                <View
                  style={{ height: 1, backgroundColor: colors.border, marginHorizontal: space.lg }}
                />
              ) : null}
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
