/**
 * Money component — renders a paise amount using tabular numerals so the
 * digits don't shimmy as values animate (e.g. rent-due balance going down
 * as a payment is processed).
 *
 * Sizes track the typography scale so a screen never picks a custom font
 * size for money.
 *
 *   <Money paise={1200000} size="hero" />      // ₹12,000 — for the rent hero
 *   <Money paise={1200000} size="body" />      // inline
 *   <Money paise={1234567} size="display" compact />  // ₹1.2L — for KPI tiles
 */
import { Text, type TextStyle, type StyleProp } from 'react-native';

import { useTheme } from '../../lib/theme';
import { formatRupees, type FormatOpts } from '../../lib/money';

interface MoneyProps extends FormatOpts {
  paise: number;
  size?: 'caption' | 'small' | 'body' | 'bodyLg' | 'h3' | 'h2' | 'h1' | 'display' | 'hero';
  /** Override colour (default: text). */
  color?: string;
  /** Weight override; default semibold for body+, extrabold for hero/display. */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  style?: StyleProp<TextStyle>;
}

export function Money({
  paise,
  size = 'body',
  color,
  weight,
  style,
  ...formatOpts
}: MoneyProps) {
  const { colors, fontSize, fontWeight, lineHeight, tabularNumStyle } = useTheme();
  const sz = fontSize[size];
  const lh = lineHeight[size];
  const defaultWeight = size === 'hero' || size === 'display' || size === 'h1' ? 'extrabold' : 'semibold';
  const w = fontWeight[weight ?? defaultWeight];

  return (
    <Text
      style={[
        {
          color: color ?? colors.text,
          fontSize: sz,
          lineHeight: lh,
          fontWeight: w,
          // Letter-spacing tightens display sizes — looks more "fintech".
          letterSpacing: sz >= fontSize.display ? -0.5 : 0,
        },
        tabularNumStyle,
        style,
      ]}
    >
      {formatRupees(paise, formatOpts)}
    </Text>
  );
}
