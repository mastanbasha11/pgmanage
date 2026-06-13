import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/theme';

import { Pressable } from './Pressable';

interface IconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  /** Optional rounded background so the icon sits in a chip. */
  withBackground?: boolean;
}

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color,
  size = 22,
  withBackground,
}: IconButtonProps) {
  const { colors, radius, space, TOUCH_TARGET } = useTheme();
  const tint = color ?? colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      pressScale={0.92}
      style={{
        minWidth: TOUCH_TARGET,
        minHeight: TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: withBackground ? radius.pill : radius.md,
        backgroundColor: withBackground ? colors.surfaceMuted : 'transparent',
        padding: withBackground ? space.sm : 0,
      }}
    >
      <Ionicons name={name} size={size} color={tint} />
    </Pressable>
  );
}
