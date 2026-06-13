/**
 * Toast host + imperative `toast()` API.
 *
 * Mount <ToastHost /> once at the root (inside ThemeProvider) so any
 * screen can fire a toast without a context import:
 *
 *   import { toast } from '@/components/ui';
 *   toast.success('Rent paid · ₹12,000');
 *   toast.error('Could not connect');
 *   toast.info('Welcome back, Aditya');
 *
 * Why a module-level emitter instead of context: imperative ergonomics
 * matter for one-off transient state. Pure React would need a hook + a
 * provider + a useEffect chain — too much ceremony for a 3-line API.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme';

type Tone = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  message: string;
  tone: Tone;
}

let nextId = 1;
let listener: ((entry: ToastEntry | null) => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;

function show(message: string, tone: Tone) {
  if (!listener) return;
  const entry: ToastEntry = { id: nextId++, message, tone };
  listener(entry);
  if (activeTimer) clearTimeout(activeTimer);
  activeTimer = setTimeout(() => listener?.(null), 3200);
}

export const toast = {
  success: (msg: string) => show(msg, 'success'),
  error: (msg: string) => show(msg, 'error'),
  info: (msg: string) => show(msg, 'info'),
};

export function ToastHost() {
  const [entry, setEntry] = useState<ToastEntry | null>(null);
  const offset = useSharedValue(-80);

  useEffect(() => {
    listener = setEntry;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    offset.value = withTiming(entry ? 0 : -80, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [entry, offset]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: offset.value < -60 ? 0 : 1,
  }));

  return (
    <SafeAreaView
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
    >
      <Animated.View
        pointerEvents="none"
        style={[{ paddingHorizontal: 16, paddingTop: 8 }, animated]}
      >
        {entry ? <ToastCard entry={entry} /> : null}
      </Animated.View>
    </SafeAreaView>
  );
}

function ToastCard({ entry }: { entry: ToastEntry }) {
  const { colors, fontSize, fontWeight, radius, shadows, space } = useTheme();
  const palette = (() => {
    switch (entry.tone) {
      case 'success':
        return {
          bg: colors.successBg,
          fg: colors.successFg,
          border: colors.successBorder,
          icon: 'checkmark-circle' as const,
        };
      case 'error':
        return {
          bg: colors.dangerBg,
          fg: colors.dangerFg,
          border: colors.dangerBorder,
          icon: 'alert-circle' as const,
        };
      case 'info':
      default:
        return {
          bg: colors.infoBg,
          fg: colors.infoFg,
          border: colors.infoBorder,
          icon: 'information-circle' as const,
        };
    }
  })();
  return (
    <View
      style={[
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
        },
        shadows.cardElevated,
      ]}
    >
      <Ionicons name={palette.icon} color={palette.fg} size={20} />
      <Text
        style={{
          flex: 1,
          color: palette.fg,
          fontSize: fontSize.body,
          fontWeight: fontWeight.semibold,
        }}
      >
        {entry.message}
      </Text>
    </View>
  );
}
