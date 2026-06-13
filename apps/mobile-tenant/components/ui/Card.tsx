/**
 * Themed Card.
 *
 * Three visual variants:
 *   - 'standard'  → surface, soft shadow, border. The default.
 *   - 'hero'      → larger radius, accent-tinted halo shadow. Use for the
 *                   ONE most important card on a screen (e.g. rent-due on
 *                   Home, referral hero on the Referral screen).
 *   - 'flat'      → surfaceMuted, no shadow, no border. Use inside another
 *                   card or for low-priority groupings.
 *
 * `pressable` makes the whole card tappable with a press-scale animation
 * — useful for "tap to expand" rows (ledger entries, ticket items).
 */
import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '../../lib/theme';

import { Pressable } from './Pressable';

type Variant = 'standard' | 'hero' | 'flat';

interface CardProps {
  children: ReactNode;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  /** Make the whole card tappable. Provides press-scale + accessible role. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Override padding. Default: lg on standard/flat, xl on hero. */
  padding?: number;
}

export function Card({
  children,
  variant = 'standard',
  style,
  onPress,
  accessibilityLabel,
  padding,
}: CardProps) {
  const { colors, radius, shadows, space } = useTheme();

  const baseStyle: ViewStyle = (() => {
    switch (variant) {
      case 'hero':
        return {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          padding: padding ?? space.xl,
          ...shadows.hero,
        };
      case 'flat':
        return {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.lg,
          padding: padding ?? space.lg,
        };
      case 'standard':
      default:
        return {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: padding ?? space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadows.card,
        };
    }
  })();

  const merged = [baseStyle, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={merged}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={merged}>{children}</View>;
}
