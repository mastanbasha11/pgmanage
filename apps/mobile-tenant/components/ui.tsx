/**
 * Shared UI primitives. Every screen builds out of these so visual style is
 * consistent and the design-tokens module is the single brand source.
 *
 * Components:
 *   - Screen: scrollable scaffold with SafeArea + status bar.
 *   - Header: app-bar style title + optional right slot.
 *   - Card: rounded panel.
 *   - KpiCard: dashboard tile.
 *   - Button (primary/secondary/ghost), IconButton.
 *   - Field: labeled input with consistent height + 48dp tap area.
 *   - Empty: centered placeholder for empty lists / no-data states.
 *   - StatusPill: small coloured chip (PAID, NOTICE etc.).
 *
 * Naming + props mirror the web app's shadcn components where possible so
 * cross-platform mental model is single.
 */
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, shadow, space, TOUCH_TARGET, type as fontSize } from '../lib/theme';

// ── Layout ───────────────────────────────────────────────────────────────────

export function Screen({
  children,
  style,
  scroll,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  scroll?: boolean;
  padded?: boolean;
}) {
  const inner = (
    <View style={[{ flex: 1, padding: padded ? space.lg : 0 }, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screenBg} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      {scroll ? (
        <View style={{ flex: 1 }}>{inner}</View>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  iconName,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
  iconName?: keyof typeof Ionicons.glyphMap;
}) {
  const toneMap = {
    neutral: { bg: colors.surfaceMuted, fg: colors.primary },
    success: { bg: colors.successBg, fg: colors.success },
    warn: { bg: colors.warnBg, fg: colors.warn },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
  }[tone];
  return (
    <View style={[styles.kpi, { borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {iconName && (
          <View style={[styles.kpiIconBox, { backgroundColor: toneMap.bg }]}>
            <Ionicons name={iconName} size={18} color={toneMap.fg} />
          </View>
        )}
        <Text style={styles.kpiLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      {!!hint && <Text style={styles.kpiHint}>{hint}</Text>}
    </View>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  iconName?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  block?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = 'primary',
  iconName,
  loading,
  block,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const v = BUTTON_VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      android_ripple={{ color: v.ripple }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border },
        block && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {iconName && <Ionicons name={iconName} size={18} color={v.fg} />}
          <Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTON_VARIANTS = {
  primary: {
    bg: colors.accent,
    fg: colors.white,
    border: colors.accent,
    ripple: 'rgba(255,255,255,0.2)',
  },
  secondary: {
    bg: colors.surface,
    fg: colors.primary,
    border: colors.border,
    ripple: 'rgba(0,0,0,0.06)',
  },
  ghost: {
    bg: 'transparent',
    fg: colors.accent,
    border: 'transparent',
    ripple: 'rgba(13,148,136,0.12)',
  },
  danger: {
    bg: colors.danger,
    fg: colors.white,
    border: colors.danger,
    ripple: 'rgba(255,255,255,0.2)',
  },
};

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color = colors.primary,
  size = 22,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
      hitSlop={8}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

// ── Form field ───────────────────────────────────────────────────────────────

export function Field({
  label,
  required,
  style,
  ...rest
}: TextInputProps & { label: string; required?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        style={styles.fieldInput}
        {...rest}
      />
    </View>
  );
}

// ── Status / chips ───────────────────────────────────────────────────────────

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
}) {
  const map = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
    success: { bg: colors.successBg, fg: colors.success },
    warn: { bg: colors.warnBg, fg: colors.warn },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function Empty({
  iconName = 'document-text-outline',
  title,
  hint,
  action,
}: {
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconBox}>
        <Ionicons name={iconName} size={28} color={colors.textDim} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!hint && <Text style={styles.emptyHint}>{hint}</Text>}
      {action}
    </View>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      {!!label && <Text style={{ color: colors.textMuted, marginTop: space.sm }}>{label}</Text>}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function rupees(paise: number): string {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(paise / 100);
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenBg: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
    gap: space.sm,
  },
  headerTitle: { fontSize: fontSize.h1, fontWeight: '700', color: colors.text } as TextStyle,
  headerSubtitle: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 } as TextStyle,

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow.card,
  },

  kpi: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    minWidth: 0,
    flex: 1,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  kpiValue: { fontSize: fontSize.h2, fontWeight: '800', color: colors.text, marginTop: space.xs },
  kpiHint: { fontSize: fontSize.caption, color: colors.textDim, marginTop: 2 },

  btn: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  btnText: { fontSize: fontSize.bodyLg, fontWeight: '700', letterSpacing: 0.1 },

  iconBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.sm,
  },

  fieldLabel: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  fieldInput: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.bodyLg,
    color: colors.text,
    backgroundColor: colors.surface,
  },

  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: fontSize.caption, fontWeight: '700', letterSpacing: 0.2 },

  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.sm },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  emptyHint: { fontSize: fontSize.small, color: colors.textMuted, textAlign: 'center' },

  loading: { padding: space.xxl, alignItems: 'center', justifyContent: 'center' },
});
