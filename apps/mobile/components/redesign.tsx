/**
 * Redesign primitives — the mobile twin of apps/web/src/components/ui/redesign.tsx.
 *
 * These implement the visual language from the pgmanagemobile.html mock:
 * bordered pills with a leading dot, room badges, progress tracks, KPI tiles,
 * and the small SVG charts. Names and tones deliberately match the web module
 * so a screen ported between platforms reads the same.
 *
 * Tones use the mock's single-letter keys (g/a/r/s/b/v) because that is how the
 * design references them; `Tone` in ui.tsx keeps the long names for legacy call
 * sites. Both map onto the same theme tokens.
 */
import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path, Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors, radius, space, chartColors } from '../lib/theme';

// ── Pills & tags ─────────────────────────────────────────────────────────────

export type PillTone = 'g' | 'a' | 'r' | 's' | 'b' | 'v';

const PILL: Record<PillTone, { bg: string; fg: string; line: string; dot: string }> = {
  g: { bg: colors.successBg, fg: colors.success, line: colors.successLine, dot: '#22a559' },
  a: { bg: colors.warnBg, fg: colors.warn, line: colors.warnLine, dot: '#e0912f' },
  r: { bg: colors.dangerBg, fg: colors.danger, line: colors.dangerLine, dot: colors.danger },
  s: { bg: colors.neutralBg, fg: colors.neutralFg, line: colors.neutralLine, dot: '#9aa1ad' },
  b: { bg: colors.infoBg, fg: '#1c5cab', line: colors.infoLine, dot: colors.info },
  v: { bg: colors.purpleBg, fg: colors.purple, line: colors.purpleLine, dot: colors.purple },
};

export function Pill({
  label,
  tone = 's',
  dot = false,
  style,
}: {
  label: string;
  tone?: PillTone;
  /** Leading status dot — use for state (Paid/Overdue), not for categories. */
  dot?: boolean;
  style?: ViewStyle;
}) {
  const t = PILL[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg, borderColor: t.line }, style]}>
      {dot && <View style={[s.pillDot, { backgroundColor: t.dot }]} />}
      <Text style={[s.pillText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export type TagKind = 'share' | 'ac' | 'suite';

export function Tag({ label, kind = 'ac' }: { label: string; kind?: TagKind }) {
  const map: Record<TagKind, { bg: string; fg: string; line: string }> = {
    share: { bg: colors.warnBg, fg: '#92600b', line: colors.warnLine },
    ac: { bg: colors.neutralBg, fg: '#4b5566', line: colors.neutralLine },
    suite: { bg: colors.purpleBg, fg: colors.purple, line: colors.purpleLine },
  };
  const t = map[kind];
  return (
    <View style={[s.tag, { backgroundColor: t.bg, borderColor: t.line }]}>
      <Text style={[s.tagText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Infer the tag colour from a room-type name so callers don't repeat this. */
export function tagKindFor(roomType: string | null | undefined): TagKind {
  const t = (roomType || '').toLowerCase();
  if (t.includes('suite')) return 'suite';
  if (t.includes('share')) return 'share';
  return 'ac';
}

// ── Room badge ───────────────────────────────────────────────────────────────

/** The green room·bed chip used in every list row (mock `.rbadge`). */
export function RoomBadge({
  room,
  sub,
  tone = 'g',
}: {
  room: string;
  sub?: string;
  tone?: PillTone;
}) {
  const t = PILL[tone];
  return (
    <View style={[s.rbadge, { backgroundColor: t.bg, borderColor: t.line }]}>
      <Text style={[s.rbadgeNum, { color: t.fg }]} numberOfLines={1}>
        {room}
      </Text>
      {!!sub && (
        <Text style={[s.rbadgeSub, { color: t.fg }]} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </View>
  );
}

// ── Track (progress bar) ─────────────────────────────────────────────────────

export function Track({
  pct,
  color = colors.accent,
  height = 7,
}: {
  /** 0-100. Clamped, so callers can pass raw ratios without guarding. */
  pct: number;
  color?: string;
  height?: number;
}) {
  const w = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <View
        style={{ width: `${w}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }}
      />
    </View>
  );
}

/** Horizontal ranked bars — "Spend by person", "Where opex went". */
export function RankBars({
  rows,
  labelWidth = 96,
}: {
  rows: { label: string; sub?: string; value: string; pct: number; color?: string }[];
  labelWidth?: number;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((r, i) => (
        <View key={`${r.label}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: labelWidth }}>
            <Text style={s.rankLabel} numberOfLines={1}>
              {r.label}
            </Text>
            {!!r.sub && (
              <Text style={s.rankSub} numberOfLines={1}>
                {r.sub}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Track pct={r.pct} color={r.color || chartColors[i % chartColors.length]} />
          </View>
          <Text style={s.rankValue} numberOfLines={1}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

export function KpiTile({
  label,
  value,
  foot,
  tone,
  children,
}: {
  label: string;
  value: string | number;
  foot?: string;
  /** Tints the border + background; use sparingly (one alarming tile per row). */
  tone?: 'danger' | 'warn' | 'accent';
  /** Extra content under the value — a Track, a Delta, a sparkline. */
  children?: ReactNode;
}) {
  const tint =
    tone === 'danger'
      ? { borderColor: colors.dangerLine, backgroundColor: '#fffafa' }
      : tone === 'warn'
        ? { borderColor: colors.warnLine, backgroundColor: '#fffdf6' }
        : tone === 'accent'
          ? { borderColor: colors.accentDim, backgroundColor: colors.accentBg }
          : null;
  const valueColor = tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={[s.kpi, tint]}>
      <Text style={s.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[s.kpiValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {children}
      {!!foot && (
        <Text style={s.kpiFoot} numberOfLines={2}>
          {foot}
        </Text>
      )}
    </View>
  );
}

export function Delta({ value, tone }: { value: string; tone: 'up' | 'down' | 'warn' }) {
  const map = {
    up: { fg: colors.success, bg: colors.successBg },
    down: { fg: colors.danger, bg: colors.dangerBg },
    warn: { fg: colors.warn, bg: colors.warnBg },
  }[tone];
  return (
    <View style={[s.delta, { backgroundColor: map.bg }]}>
      <Text style={[s.deltaText, { color: map.fg }]}>{value}</Text>
    </View>
  );
}

// ── Notice card (the amber "needs attention" block) ──────────────────────────

export function NoticeCard({
  tone = 'warn',
  children,
  style,
}: {
  tone?: 'warn' | 'danger' | 'accent';
  children: ReactNode;
  style?: ViewStyle;
}) {
  const map = {
    warn: { border: colors.warnLine, bg: '#fffdf6' },
    danger: { border: colors.dangerLine, bg: '#fffafa' },
    accent: { border: '#bfe6dd', bg: '#f2fbf9' },
  }[tone];
  return (
    <View style={[s.notice, { borderColor: map.border, backgroundColor: map.bg }, style]}>
      {children}
    </View>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────

/**
 * Filled sparkline. Deliberately axis-less — it conveys shape, and the exact
 * numbers live in the KPI next to it.
 */
export function Sparkline({
  data,
  color = colors.accent,
  width = 130,
  height = 44,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return <View style={{ width, height }} />;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const range = mx - mn || 1;
  const X = (i: number) => 2 + (i * (width - 4)) / (data.length - 1);
  const Y = (v: number) => height - 3 - ((v - mn) / range) * (height - 8);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${X(data.length - 1).toFixed(1)} ${height} L2 ${height} Z`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={area} fill={color} fillOpacity={0.11} />
      <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Donut with a centred caption. Slices are gapped so adjacent colours read apart. */
export function Donut({
  data,
  size = 104,
  innerRatio = 0.62,
  caption,
  centerValue,
}: {
  data: { value: number; color?: string }[];
  size?: number;
  innerRatio?: number;
  caption?: string;
  centerValue?: string;
}) {
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  const R = size / 2 - 4;
  const r = R * innerRatio;
  const cx = size / 2;
  const cy = size / 2;
  const gap = 0.05;
  let ang = -Math.PI / 2;
  const paths: { d: string; c: string }[] = [];

  if (total > 0) {
    data.forEach((d, i) => {
      const frac = (d.value || 0) / total;
      const a0 = ang + gap / 2;
      const a1 = ang + frac * 2 * Math.PI - gap / 2;
      ang += frac * 2 * Math.PI;
      if (a1 <= a0) return; // slice too small to render once the gap is taken
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad: number, a: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const [x0, y0] = pt(R, a0);
      const [x1, y1] = pt(R, a1);
      const [x2, y2] = pt(r, a1);
      const [x3, y3] = pt(r, a0);
      paths.push({
        d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`,
        c: d.color || chartColors[i % chartColors.length],
      });
    });
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {total <= 0 && (
        <Path
          d={`M${cx} ${cy - R} A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`}
          fill={colors.surfaceMuted}
        />
      )}
      {paths.map((p, i) => (
        <Path key={i} d={p.d} fill={p.c} />
      ))}
      {!!caption && (
        <SvgText x={cx} y={cy - 1} textAnchor="middle" fontSize={8} fill={colors.textDim} fontWeight="700">
          {caption}
        </SvgText>
      )}
      {!!centerValue && (
        <SvgText x={cx} y={cy + 11} textAnchor="middle" fontSize={12} fontWeight="800" fill={colors.text}>
          {centerValue}
        </SvgText>
      )}
    </Svg>
  );
}

/** Simple monthly bar chart — spend trend, money in/out. */
export function BarChart({
  data,
  width = 300,
  height = 96,
  color = colors.accent,
  highlightLast = true,
}: {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
}) {
  if (!data.length) return <View style={{ width, height }} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const B = 14; // room for the month labels
  const gap = 4;
  const bw = Math.max(2, (width - gap * (data.length - 1)) / data.length);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((d, i) => {
        const h = Math.max(1, ((d.value / max) * (height - B - 4)) | 0);
        const x = i * (bw + gap);
        const isLast = i === data.length - 1;
        return (
          <Rect
            key={i}
            x={x}
            y={height - B - h}
            width={bw}
            height={h}
            rx={3}
            fill={color}
            fillOpacity={highlightLast && !isLast ? 0.35 : 1}
          />
        );
      })}
      {data.map((d, i) => (
        <SvgText
          key={`l${i}`}
          x={i * (bw + gap) + bw / 2}
          y={height - 3}
          textAnchor="middle"
          fontSize={7.5}
          fill={colors.textDim}
          fontWeight="700"
        >
          {d.label}
        </SvgText>
      ))}
    </Svg>
  );
}

/**
 * ROI payback: actual vs expected with the shortfall shaded between them.
 * `todayIndex` splits history from projection.
 */
export function PaybackChart({
  actual,
  expected,
  targetLakh,
  todayIndex,
  width = 294,
  height = 150,
}: {
  actual: number[];
  expected: number[];
  targetLakh: number;
  todayIndex: number;
  width?: number;
  height?: number;
}) {
  const Lp = 30;
  const R = 8;
  const T = 8;
  const B = 20;
  const n = Math.max(expected.length, actual.length, 2);
  const maxY = Math.max(targetLakh, ...expected, ...actual, 1) * 1.1;
  const X = (i: number) => Lp + (i * (width - Lp - R)) / (n - 1);
  const Y = (v: number) => T + (1 - v / maxY) * (height - T - B);
  const path = (a: number[]) =>
    a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');

  const k = Math.min(todayIndex, actual.length - 1, expected.length - 1);
  const wedge =
    k > 0
      ? `${path(expected.slice(0, k + 1))} ${actual
          .slice(0, k + 1)
          .reverse()
          .map((v, i) => `L${X(k - i).toFixed(1)} ${Y(v).toFixed(1)}`)
          .join(' ')} Z`
      : '';

  const ticks = [0, maxY / 2, maxY];
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {ticks.map((g, i) => (
        <Line key={i} x1={Lp} y1={Y(g)} x2={width - R} y2={Y(g)} stroke={colors.borderSoft} />
      ))}
      {ticks.map((g, i) => (
        <SvgText key={`t${i}`} x={Lp - 4} y={Y(g) + 3} textAnchor="end" fontSize={7} fill={colors.textDim}>
          {`${Math.round(g)}L`}
        </SvgText>
      ))}
      {!!wedge && <Path d={wedge} fill={colors.danger} fillOpacity={0.08} />}
      <Line
        x1={Lp}
        y1={Y(targetLakh)}
        x2={width - R}
        y2={Y(targetLakh)}
        stroke="#e34948"
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      <Path d={path(expected)} fill="none" stroke={colors.info} strokeWidth={1.6} strokeDasharray="2 4" opacity={0.7} />
      <Path d={path(actual)} fill="none" stroke={colors.success} strokeWidth={2.2} strokeLinecap="round" />
      {k > 0 && (
        <>
          <Line x1={X(k)} y1={T} x2={X(k)} y2={height - B} stroke={colors.text} strokeDasharray="2 2" />
          <SvgText x={X(k) + 3} y={T + 8} fontSize={7.5} fontWeight="800" fill={colors.text}>
            TODAY
          </SvgText>
        </>
      )}
    </Svg>
  );
}

/** Legend row for the charts above. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View
            style={{
              width: 12,
              height: 2,
              backgroundColor: it.color,
              opacity: it.dashed ? 0.6 : 1,
            }}
          />
          <Text style={s.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    alignSelf: 'flex-start',
  },
  pillDot: { width: 5, height: 5, borderRadius: 2.5 },
  pillText: { fontSize: 10.5, fontWeight: '800' },

  tag: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    alignSelf: 'flex-start',
  },
  tagText: { fontSize: 9.5, fontWeight: '800' },

  rbadge: {
    minWidth: 38,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rbadgeNum: { fontSize: 12.5, fontWeight: '800', lineHeight: 14 },
  rbadgeSub: { fontSize: 8.5, fontWeight: '800', opacity: 0.75, marginTop: 2, lineHeight: 10 },

  track: { backgroundColor: colors.surfaceMuted, overflow: 'hidden', width: '100%' },

  rankLabel: { fontSize: 12, fontWeight: '800', color: colors.text },
  rankSub: { fontSize: 10, color: colors.textDim, fontWeight: '600' },
  rankValue: { fontSize: 12, fontWeight: '800', color: colors.text, textAlign: 'right', minWidth: 62 },

  kpi: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 11,
  },
  kpiLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  kpiValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  kpiFoot: { fontSize: 10, color: colors.textDim, fontWeight: '600', marginTop: 3 },

  delta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  deltaText: { fontSize: 9.5, fontWeight: '800' },

  notice: { borderWidth: 1, borderRadius: 16, padding: 13 },

  legendText: { fontSize: 9.5, color: colors.textMuted, fontWeight: '600' },
});
