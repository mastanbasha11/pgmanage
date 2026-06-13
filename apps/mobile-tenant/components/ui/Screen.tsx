/**
 * Screen scaffold — every route renders inside one of these.
 *
 *   - Pulls the safe-area inset on top by default (status bar avoidance).
 *   - Picks a background colour from the current theme (light/dark aware).
 *   - Switches StatusBar contents to match the scheme.
 *   - Optional scroll variant; padded by default.
 */
import { ReactNode } from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useTheme } from '../../lib/theme';

interface ScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wrap children in a ScrollView. Default off. */
  scroll?: boolean;
  /** Apply horizontal+vertical padding. Default on. */
  padded?: boolean;
  /** Use surface colour instead of bg (useful for modals / sheets). */
  surface?: boolean;
}

export function Screen({
  children,
  style,
  scroll,
  padded = true,
  surface,
}: ScreenProps) {
  const { colors, space, scheme } = useTheme();
  const background = surface ? colors.surface : colors.bg;
  const pad: ViewStyle = padded
    ? { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl }
    : {};

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[{ flexGrow: 1 }, pad, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, pad, style]}>{children}</View>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: background }}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {inner}
    </SafeAreaView>
  );
}
