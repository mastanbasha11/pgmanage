/**
 * Status pill. Single source of truth for all status colours so a "Paid"
 * chip looks identical wherever it appears (ledger row, payment history,
 * referral pipeline, etc.).
 *
 * Tones map to the semantic colour roles in the theme:
 *
 *   success      → Paid, Resolved, Credited, Approved
 *   warning      → Due, Pending, Awaiting
 *   danger       → Overdue, Rejected, Cancelled
 *   info         → In progress, Invited, Signed up
 *   accent       → Special (e.g. "New", "Bonus")
 *   celebration  → Bonus credited (referral)
 *   neutral      → Archived, Closed without action
 */
import { ReactNode } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../../lib/theme';

export type PillTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'celebration'
  | 'neutral';

interface PillProps {
  label: string;
  tone?: PillTone;
  icon?: ReactNode;
  /** Compact size for inline use; default 'md'. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Pill({ label, tone = 'neutral', icon, size = 'md', style }: PillProps) {
  const { colors, fontSize, fontWeight, radius, space } = useTheme();

  const palette = (() => {
    switch (tone) {
      case 'success':
        return { fg: colors.successFg, bg: colors.successBg, border: colors.successBorder };
      case 'warning':
        return { fg: colors.warningFg, bg: colors.warningBg, border: colors.warningBorder };
      case 'danger':
        return { fg: colors.dangerFg, bg: colors.dangerBg, border: colors.dangerBorder };
      case 'info':
        return { fg: colors.infoFg, bg: colors.infoBg, border: colors.infoBorder };
      case 'accent':
        return { fg: colors.accent, bg: colors.accentSoft, border: colors.accentBorder };
      case 'celebration':
        return { fg: colors.celebrationFg, bg: colors.celebrationBg, border: colors.celebrationBg };
      case 'neutral':
      default:
        return { fg: colors.textMuted, bg: colors.surfaceMuted, border: colors.border };
    }
  })();

  const sizing =
    size === 'sm'
      ? { paddingV: 2, paddingH: space.sm, fontSize: fontSize.caption }
      : { paddingV: 4, paddingH: space.md, fontSize: fontSize.small };

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.pill,
          paddingVertical: sizing.paddingV,
          paddingHorizontal: sizing.paddingH,
          gap: space.xs,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          color: palette.fg,
          fontSize: sizing.fontSize,
          fontWeight: fontWeight.semibold,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
