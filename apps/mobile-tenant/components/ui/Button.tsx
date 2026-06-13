/**
 * Themed Button — primary/secondary/ghost/danger variants, three sizes,
 * loading + disabled states, optional leading icon.
 *
 * All paddings + corners pulled from theme tokens so a brand-tune
 * automatically propagates. Press feedback is the shared `Pressable`
 * scale animation.
 */
import { ActivityIndicator, StyleProp, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/theme';

import { Pressable } from './Pressable';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  iconName?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  iconName,
  loading,
  disabled,
  block,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors, fontWeight, radius, space, TOUCH_TARGET } = useTheme();

  const sizes = {
    sm: { height: 40, paddingX: space.md, fontSize: 13 },
    md: { height: TOUCH_TARGET, paddingX: space.lg, fontSize: 15 },
    lg: { height: 56, paddingX: space.xl, fontSize: 17 },
  }[size];

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: colors.accent, fg: colors.onAccent, border: colors.accent };
      case 'secondary':
        return { bg: colors.surface, fg: colors.text, border: colors.borderStrong };
      case 'ghost':
        return { bg: 'transparent', fg: colors.accent, border: 'transparent' };
      case 'danger':
        return { bg: colors.dangerFg, fg: '#FFFFFF', border: colors.dangerFg };
    }
  })();

  const muted = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={muted}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      pressScale={muted ? 1 : 0.98}
      style={[
        {
          height: sizes.height,
          paddingHorizontal: sizes.paddingX,
          borderRadius: radius.md,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? 1 : 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: muted ? 0.55 : 1,
          gap: space.sm,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {iconName ? (
            <Ionicons name={iconName} size={sizes.fontSize + 2} color={palette.fg} />
          ) : null}
          <Text
            style={{
              color: palette.fg,
              fontSize: sizes.fontSize,
              fontWeight: fontWeight.semibold,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
