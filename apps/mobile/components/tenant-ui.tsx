/**
 * Forest & Sage building blocks for the resident (tenant) app.
 *
 * Mirrors the looptenantcalm mock's vocabulary: white cards on sage separated
 * by hairlines; one dark forest "anchor" card per screen; a tint card for a
 * passive note; a warm card for attention; glyph list-rows; section caps.
 * Icons are Ionicons (an established line family), never the mock's raw SVGs.
 */
import { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, type } from '../lib/theme';
import { rupees } from '../lib/tenant/money';

export { rupees };

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ── Screen shell ─────────────────────────────────────────────────────────────

export function TScreen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const inner = padded ? { paddingHorizontal: space.lg } : undefined;
  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[{ paddingBottom: space.xl }, inner]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, inner]}>{children}</View>;
}

/** App bar: title + optional sub + optional right icon buttons. Respects notch. */
export function TAppBar({
  title,
  sub,
  right,
  onBack,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.appbar, { paddingTop: insets.top + space.xs }]}>
      {onBack && (
        <TIconBtn icon="chevron-back" onPress={onBack} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.appTitle}>{title}</Text>
        {!!sub && <Text style={styles.appSub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export function TIconBtn({
  icon,
  onPress,
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity style={styles.iconBtn} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={colors.forest} />
      {badge != null && badge > 0 && (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

export type CardVariant = 'default' | 'tint' | 'warm' | 'dark';

export function TCard({
  children,
  variant = 'default',
  style,
}: {
  children: ReactNode;
  variant?: CardVariant;
  style?: ViewStyle;
}) {
  const v: ViewStyle =
    variant === 'dark'
      ? { backgroundColor: colors.forest, borderColor: colors.forest }
      : variant === 'tint'
        ? { backgroundColor: colors.sage2, borderColor: colors.border }
        : variant === 'warm'
          ? { backgroundColor: colors.apricotBg, borderColor: colors.apricotLine }
          : { backgroundColor: colors.surface, borderColor: colors.border };
  return <View style={[styles.card, v, style]}>{children}</View>;
}

/** Uppercase letter-spaced section caption (mock `.cap`). */
export function Cap({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.cap, style]}>{children}</Text>;
}

// ── List row with a rounded glyph tile ───────────────────────────────────────

export function GlyphTile({ icon, warm = false }: { icon: IconName; warm?: boolean }) {
  return (
    <View style={[styles.glyph, warm && { backgroundColor: colors.apricotBg }]}>
      <Ionicons name={icon} size={16} color={warm ? colors.apricot : colors.forest} />
    </View>
  );
}

export function TListRow({
  icon,
  warm,
  title,
  sub,
  right,
  chevron,
  onPress,
  last,
}: {
  icon?: IconName;
  warm?: boolean;
  title: string;
  sub?: string;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const inner = (
    <>
      {icon && <GlyphTile icon={icon} warm={warm} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lrTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={styles.lrSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
    </>
  );
  const rowStyle = [styles.lr, last && { borderBottomWidth: 0 }];
  return onPress ? (
    <TouchableOpacity style={rowStyle} onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  ) : (
    <View style={rowStyle}>{inner}</View>
  );
}

// ── Avatar / Pill / Button ───────────────────────────────────────────────────

export function TAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initial}</Text>
    </View>
  );
}

export type TPillTone = 'sage' | 'dark' | 'warm' | 'ghost' | 'money';

export function TPill({
  label,
  tone = 'sage',
  icon,
}: {
  label: string;
  tone?: TPillTone;
  icon?: IconName;
}) {
  const map: Record<TPillTone, { bg: string; fg: string; line: string }> = {
    sage: { bg: colors.sage2, fg: colors.forest, line: colors.border },
    dark: { bg: colors.forest, fg: '#fff', line: colors.forest },
    warm: { bg: colors.apricotBg, fg: colors.apricotInk, line: colors.apricotLine },
    ghost: { bg: colors.surface, fg: colors.textMuted, line: colors.border },
    money: { bg: colors.surface, fg: colors.money, line: colors.border },
  };
  const t = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.line }]}>
      {icon && <Ionicons name={icon} size={11} color={t.fg} />}
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function TButton({
  label,
  onPress,
  variant = 'default',
  icon,
  small,
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'default' | 'dark';
  icon?: IconName;
  small?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const dark = variant === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      style={[
        styles.btn,
        small && styles.btnSm,
        dark
          ? { backgroundColor: colors.forest, borderColor: colors.forest }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={small ? 14 : 16} color={dark ? '#fff' : colors.forest} />
      )}
      <Text
        style={[
          small ? styles.btnTextSm : styles.btnText,
          { color: dark ? '#fff' : colors.forest },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Thin progress bar (mock `.bar`), money-green fill by default. */
export function TBar({ pct, color = colors.money }: { pct: number; color?: string }) {
  const w = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View style={styles.bar}>
      <View style={{ width: `${w}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  appTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  appSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  iconBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 15,
  },
  cap: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.textMuted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  glyph: {
    width: 34,
    height: 34,
    borderRadius: radius.tile,
    backgroundColor: colors.sage2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  lrTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  lrSub: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  avatar: {
    backgroundColor: colors.sage2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.forest, fontWeight: '800' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 10.5, fontWeight: '700' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.btn,
    borderWidth: 1,
  },
  btnSm: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 11 },
  btnText: { fontSize: 13.5, fontWeight: '800' },
  btnTextSm: { fontSize: 12, fontWeight: '800' },
  bar: {
    height: 5,
    backgroundColor: colors.sage2,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
