/**
 * Shared UI primitives. Every screen builds out of these so visual style is
 * consistent and the design-tokens module is the single brand source.
 *
 * Components (see JSDoc on each for props):
 *   Layout       Screen · Header · Section · Row · Divider · Spacer
 *   Surfaces     Card · KpiCard · StatTile
 *   Buttons      Button · IconButton · Fab
 *   Inputs       Field · Textarea · MoneyField · DateField · Select
 *   Display      StatusPill · Chip · ChipStrip · Segmented · Avatar · Badge
 *   Feedback     Empty · Loading · Toast
 *   Overlays     Sheet · ConfirmDialog
 *
 * Naming + props mirror the web app's shadcn components where possible so
 * cross-platform mental model is single.
 */
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
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
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  scroll?: boolean;
  padded?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screenBg} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={[{ flex: 1, padding: padded ? space.lg : 0 }, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <IconButton
          name="chevron-back"
          onPress={onBack}
          accessibilityLabel="Back"
          size={24}
        />
      )}
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

export function Section({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      {(title || right) && (
        <View style={styles.sectionHead}>
          {!!title && <Text style={styles.sectionTitle}>{title}</Text>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Row({
  children,
  gap = space.sm,
  align = 'center',
  justify = 'flex-start',
  wrap,
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: 'flex-start' | 'center' | 'flex-end' | 'baseline' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  wrap?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Spacer({ h }: { h?: number }) {
  return <View style={{ height: h ?? space.md }} />;
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
        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
        style={({ pressed }) => [styles.card, style, pressed && Platform.OS === 'ios' && { opacity: 0.85 }]}
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
  onPress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const toneMap = {
    neutral: { bg: colors.surfaceMuted, fg: colors.primary },
    success: { bg: colors.successBg, fg: colors.success },
    warn: { bg: colors.warnBg, fg: colors.warn },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
  }[tone];
  const inner = (
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
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
        style={({ pressed }) => [
          { flex: 1, minWidth: 0 },
          pressed && Platform.OS === 'ios' && { opacity: 0.85 },
        ]}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
}) {
  const toneMap = {
    neutral: { fg: colors.primary, bg: colors.surface },
    success: { fg: colors.success, bg: colors.successBg },
    warn: { fg: colors.warn, bg: colors.warnBg },
    danger: { fg: colors.danger, bg: colors.dangerBg },
    info: { fg: colors.info, bg: colors.infoBg },
  }[tone];
  return (
    <View style={[styles.statTile, { backgroundColor: toneMap.bg }]}>
      <Text style={[styles.statVal, { color: toneMap.fg }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!hint && <Text style={styles.statHint}>{hint}</Text>}
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
  size?: 'md' | 'sm';
  style?: ViewStyle;
};

export function Button({
  label,
  variant = 'primary',
  iconName,
  loading,
  block,
  size = 'md',
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
        size === 'sm' && styles.btnSm,
        { backgroundColor: v.bg, borderColor: v.border },
        block && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.55 },
        pressed && Platform.OS === 'ios' && { opacity: 0.85 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {iconName && <Ionicons name={iconName} size={size === 'sm' ? 16 : 18} color={v.fg} />}
          <Text style={[styles.btnText, size === 'sm' && { fontSize: fontSize.body }, { color: v.fg }]}>
            {label}
          </Text>
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
  disabled,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
      style={({ pressed }) => [
        styles.iconBtn,
        disabled && { opacity: 0.4 },
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
      hitSlop={8}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

/** Bottom-right floating action button. Fixed 56dp per Material spec. */
export function Fab({
  name,
  onPress,
  accessibilityLabel,
  extended,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  extended?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
      style={({ pressed }) => [
        styles.fab,
        extended && { paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', gap: space.sm },
        pressed && Platform.OS === 'ios' && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={name} size={26} color={colors.white} />
      {extended && <Text style={styles.fabText}>{extended}</Text>}
    </Pressable>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────────

export function Field({
  label,
  required,
  error,
  hint,
  style,
  ...rest
}: TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        style={[styles.fieldInput, error && { borderColor: colors.danger }]}
        {...rest}
      />
      {!!hint && !error && <Text style={styles.fieldHint}>{hint}</Text>}
      {!!error && <Text style={[styles.fieldHint, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

export function Textarea({
  label,
  required,
  error,
  hint,
  style,
  rows = 4,
  ...rest
}: TextInputProps & {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  rows?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {!!label && (
        <Text style={styles.fieldLabel}>
          {label}
          {required && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
      )}
      <TextInput
        multiline
        placeholderTextColor={colors.textDim}
        numberOfLines={rows}
        textAlignVertical="top"
        style={[
          styles.fieldInput,
          { minHeight: 24 * rows, paddingTop: space.md, paddingBottom: space.md },
          error && { borderColor: colors.danger },
        ]}
        {...rest}
      />
      {!!hint && !error && <Text style={styles.fieldHint}>{hint}</Text>}
      {!!error && <Text style={[styles.fieldHint, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

/** Money input in rupees (₹). Emits paise (integer) via onChangeAmount. */
export function MoneyField({
  label,
  required,
  valuePaise,
  onChangeAmount,
  placeholder = '0',
  style,
  error,
}: {
  label: string;
  required?: boolean;
  valuePaise: number | null | undefined;
  onChangeAmount: (paise: number) => void;
  placeholder?: string;
  style?: ViewStyle;
  error?: string;
}) {
  const [text, setText] = useState<string>(
    valuePaise != null ? String(Math.round(valuePaise / 100)) : '',
  );
  useEffect(() => {
    setText(valuePaise != null ? String(Math.round(valuePaise / 100)) : '');
  }, [valuePaise]);
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      <View style={[styles.fieldInputRow, error && { borderColor: colors.danger }]}>
        <Text style={styles.moneyPrefix}>₹</Text>
        <TextInput
          value={text}
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9]/g, '');
            setText(clean);
            onChangeAmount(clean ? parseInt(clean, 10) * 100 : 0);
          }}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          style={[styles.moneyInput]}
        />
      </View>
      {!!error && <Text style={[styles.fieldHint, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

/** Simple YYYY-MM-DD date picker: opens a lightweight scroll month/day picker
 *  via a Sheet. Native pickers are avoided so we don't pull in an extra dep. */
export function DateField({
  label,
  value,
  onChange,
  required,
  style,
  minYear = 2020,
  maxYear = 2035,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string) => void;
  required?: boolean;
  style?: ViewStyle;
  minYear?: number;
  maxYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const [year, setYear] = useState<number>(parsed?.y ?? new Date().getFullYear());
  const [month, setMonth] = useState<number>(parsed?.m ?? new Date().getMonth() + 1);
  const [day, setDay] = useState<number>(parsed?.d ?? new Date().getDate());
  useEffect(() => {
    const p = parseISO(value);
    if (p) {
      setYear(p.y);
      setMonth(p.m);
      setDay(p.d);
    }
  }, [value]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i),
    [minYear, maxYear],
  );
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
        style={styles.fieldInputRow}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.moneyInput, { fontWeight: value ? '600' : '400', color: value ? colors.text : colors.textDim }]}>
          {value ? formatDateHuman(value) : 'Pick date'}
        </Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <Row gap={space.sm}>
          <PickerColumn<number>
            label="Day"
            options={Array.from({ length: daysInMonth }, (_, i) => i + 1)}
            value={day}
            onChange={setDay}
            render={(n) => String(n).padStart(2, '0')}
          />
          <PickerColumn<number>
            label="Month"
            options={Array.from({ length: 12 }, (_, i) => i + 1)}
            value={month}
            onChange={setMonth}
            render={(n) => MONTH_NAMES[n - 1]}
          />
          <PickerColumn<number> label="Year" options={years} value={year} onChange={setYear} render={(n) => String(n)} />
        </Row>
        <Spacer />
        <Button
          label="Confirm"
          onPress={() => {
            const d = Math.min(day, new Date(year, month, 0).getDate());
            onChange(
              `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            );
            setOpen(false);
          }}
          block
        />
      </Sheet>
    </View>
  );
}

function PickerColumn<T>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView
        style={styles.pickerScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.xs }}
      >
        {options.map((o, i) => {
          const on = o === value;
          return (
            <Pressable
              key={i}
              onPress={() => onChange(o)}
              android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
              style={[styles.pickerItem, on && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.pickerText, on && { color: colors.white, fontWeight: '700' }]}>
                {render(o)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Select — modal-based single-value picker. Renders a Field-styled button that
 *  opens a Sheet with the options list. Supports search when > 8 options. */
export function Select<T extends string | number>({
  label,
  required,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  style,
  disabled,
  searchable,
}: {
  label: string;
  required?: boolean;
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  placeholder?: string;
  style?: ViewStyle;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const shown = searchable && q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
        style={[styles.fieldInputRow, disabled && { opacity: 0.55 }]}
      >
        <Text
          style={[
            styles.moneyInput,
            { color: selected ? colors.text : colors.textDim, fontWeight: selected ? '600' : '400' },
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} scroll>
        {(searchable || options.length > 8) && (
          <View style={{ marginBottom: space.md }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search"
              placeholderTextColor={colors.textDim}
              style={styles.fieldInput}
            />
          </View>
        )}
        {shown.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
              style={[styles.selectRow, on && { backgroundColor: colors.accentBg }]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.selectText, on && { color: colors.accent, fontWeight: '700' }]}
                >
                  {o.label}
                </Text>
                {!!o.hint && <Text style={styles.selectHint}>{o.hint}</Text>}
              </View>
              {on && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </Pressable>
          );
        })}
        {shown.length === 0 && (
          <Text style={{ color: colors.textDim, padding: space.md, textAlign: 'center' }}>
            No matches
          </Text>
        )}
      </Sheet>
    </View>
  );
}

// ── Chips / segmented ────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'accent';

const TONE_MAP: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted, border: colors.border },
  success: { bg: colors.successBg, fg: colors.success, border: colors.success },
  warn: { bg: colors.warnBg, fg: colors.warn, border: colors.warn },
  danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info, border: colors.info },
  accent: { bg: colors.accentBg, fg: colors.accent, border: colors.accent },
};

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: Tone;
}) {
  const map = TONE_MAP[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/** Pressable filter chip. `active` swaps to filled accent look. */
export function Chip({
  label,
  active,
  onPress,
  iconName,
  count,
  disabled,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  count?: number;
  disabled?: boolean;
  tone?: Tone;
}) {
  const toneMap = tone ? TONE_MAP[tone] : null;
  const bg = active
    ? toneMap?.bg ?? colors.accent
    : colors.surface;
  const fg = active
    ? toneMap?.fg ?? colors.white
    : colors.textMuted;
  const border = active
    ? toneMap?.border ?? colors.accent
    : colors.border;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: bg, borderColor: border },
        disabled && { opacity: 0.5 },
        pressed && Platform.OS === 'ios' && { opacity: 0.85 },
      ]}
    >
      {iconName && <Ionicons name={iconName} size={14} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
      {count != null && count > 0 && (
        <View style={[styles.chipCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.surfaceMuted }]}>
          <Text style={[styles.chipCountText, { color: fg }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Horizontally scrolling chip strip. Handles overflow gracefully. */
export function ChipStrip({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
    >
      {children}
    </ScrollView>
  );
}

/** Segmented control — mutually exclusive tabs. Best for 2-4 options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; iconName?: keyof typeof Ionicons.glyphMap }>;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
            style={({ pressed }) => [
              styles.segmentedItem,
              on && styles.segmentedItemActive,
              pressed && Platform.OS === 'ios' && { opacity: 0.85 },
            ]}
          >
            {o.iconName && (
              <Ionicons name={o.iconName} size={16} color={on ? colors.text : colors.textMuted} />
            )}
            <Text style={[styles.segmentedText, on && { color: colors.text, fontWeight: '700' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  const hue = Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 40%, 88%)` },
      ]}
    >
      <Text style={{ color: `hsl(${hue}, 40%, 24%)`, fontWeight: '700', fontSize: size * 0.4 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

export function Badge({ value, tone = 'danger' }: { value: number; tone?: Tone }) {
  if (!value) return null;
  const m = TONE_MAP[tone];
  return (
    <View style={[styles.badge, { backgroundColor: m.bg, borderColor: m.border }]}>
      <Text style={[styles.badgeText, { color: m.fg }]}>{value > 99 ? '99+' : value}</Text>
    </View>
  );
}

// ── Empty / loading ──────────────────────────────────────────────────────────

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

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      {!!label && <Text style={{ color: colors.textMuted, marginTop: space.sm }}>{label}</Text>}
    </View>
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────

/** Bottom sheet built on native Modal. Scrollable content by default; pass
 *  `scroll={false}` for fixed-height dialogs (pickers, confirmations). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  scroll = true,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.sheetPanel}
        >
          <View style={styles.sheetHandle} />
          {!!title && (
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <IconButton name="close" onPress={onClose} accessibilityLabel="Close" size={22} />
            </View>
          )}
          {scroll ? (
            <ScrollView
              contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ padding: space.lg }}>{children}</View>
          )}
          {footer && <View style={styles.sheetFooter}>{footer}</View>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} scroll={false}>
      {!!message && (
        <Text style={{ color: colors.textMuted, marginBottom: space.lg, lineHeight: 20 }}>
          {message}
        </Text>
      )}
      <Row gap={space.sm}>
        <Button label="Cancel" variant="secondary" onPress={onClose} block style={{ flex: 1 }} />
        <Button
          label={confirmLabel}
          variant={confirmVariant}
          loading={loading}
          onPress={onConfirm}
          block
          style={{ flex: 1 }}
        />
      </Row>
    </Sheet>
  );
}

// ── Toast (lightweight — no context, use Alert.alert for real toasts) ───────

export function Toast({
  visible,
  message,
  tone = 'success',
}: {
  visible: boolean;
  message: string;
  tone?: 'success' | 'danger' | 'info';
}) {
  if (!visible) return null;
  const bgMap = { success: colors.success, danger: colors.danger, info: colors.info };
  return (
    <View style={[styles.toast, { backgroundColor: bgMap[tone] }]}>
      <Text style={{ color: colors.white, fontWeight: '600' }}>{message}</Text>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function rupees(paise: number | null | undefined): string {
  const n = Math.round((paise ?? 0) / 100);
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatDateHuman(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = parseISO(iso);
  if (!p) return iso;
  return `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
}

function parseISO(v: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
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

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.1,
  } as TextStyle,

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space.md,
  },

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

  statTile: {
    flex: 1,
    minWidth: 90,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statVal: { fontSize: fontSize.h2, fontWeight: '800' },
  statLabel: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  statHint: { fontSize: fontSize.caption, color: colors.textDim, marginTop: 2 },

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
  btnSm: {
    minHeight: 36,
    paddingHorizontal: space.md,
    paddingVertical: 0,
  },
  btnText: { fontSize: fontSize.bodyLg, fontWeight: '700', letterSpacing: 0.1 },

  iconBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.sm,
  },

  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    shadowOpacity: 0.24,
    elevation: 6,
  },
  fabText: { color: colors.white, fontWeight: '700', fontSize: fontSize.bodyLg },

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
  fieldInputRow: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
  },
  fieldHint: {
    fontSize: fontSize.caption,
    color: colors.textDim,
    marginTop: space.xs,
  },
  moneyPrefix: { color: colors.textMuted, fontSize: fontSize.bodyLg, fontWeight: '600' },
  moneyInput: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    color: colors.text,
    minHeight: TOUCH_TARGET,
    paddingVertical: 0,
  },

  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: fontSize.caption, fontWeight: '700', letterSpacing: 0.2 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
  },
  chipText: { fontSize: fontSize.small, fontWeight: '600' },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountText: { fontSize: 11, fontWeight: '700' },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  segmentedItem: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  segmentedItemActive: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  segmentedText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textMuted },

  avatar: { alignItems: 'center', justifyContent: 'center' },

  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },

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

  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    minHeight: 200,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: space.sm,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: fontSize.h3, fontWeight: '700', color: colors.text },
  sheetFooter: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  pickerScroll: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  pickerItem: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  pickerText: { fontSize: fontSize.body, color: colors.text },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    gap: space.sm,
    minHeight: TOUCH_TARGET,
  },
  selectText: { fontSize: fontSize.bodyLg, color: colors.text },
  selectHint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },

  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    ...shadow.card,
    shadowOpacity: 0.2,
    elevation: 6,
  },
});
