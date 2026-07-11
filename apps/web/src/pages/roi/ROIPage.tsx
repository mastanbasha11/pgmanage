/**
 * ROI (Revenue per room + room-type comparison).
 *
 * Owner-only. Shows:
 *   - Room-type roll-up: which class of room earns most per bed per month.
 *     Highlights the top type so owners know where to invest / expand.
 *   - Per-room table sortable by revenue-per-bed.
 *   - Vacancy alert for beds sitting empty > 30 days.
 *   - Rules-based recommendations: rent gap vs base, occupancy < 50%,
 *     room-type spread narrower than reality, etc.
 *
 * Expense side is intentionally property-level in this endpoint (user's
 * design choice); the Expenses page covers the "how to control spend"
 * angle with %MoM badges and recurring-item spike alerts.
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BedDouble,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/auth';
import { useROI, type ROIRoom, type ROIRoomType } from '@/hooks/useROI';
import { formatPaise } from '@/lib/utils';

export default function ROIPage() {
  const { selectedPropertyId, canAccessFinancials } = useAuthStore();
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useROI({ property_id: selectedPropertyId ?? undefined, months });

  if (!canAccessFinancials()) return <Navigate to="/tenants" replace />;

  const roomTypes = data?.room_types ?? [];
  const rooms = data?.rooms ?? [];

  const topType = roomTypes[0];
  const worstType = roomTypes.length > 1 ? roomTypes[roomTypes.length - 1] : undefined;

  const suggestions = useMemo(() => buildSuggestions(rooms, roomTypes, months), [rooms, roomTypes, months]);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ROI &amp; Room Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Revenue per room over the last {months} months, split by room type,
            with recommendations on which rooms to reprice or fill first.
          </p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!selectedPropertyId && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Pick a property from the sidebar.
          </CardContent>
        </Card>
      )}

      {isLoading && selectedPropertyId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Room-type comparison. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                Room type comparison
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Revenue per bed per month by room class. Higher = more efficient
                use of floor space.
              </p>
            </CardHeader>
            <CardContent>
              {roomTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No room types yet — set them under Properties → Setup so this
                  page can group rooms.
                </p>
              ) : (
                <div className="space-y-2">
                  <RoomTypeBars data={roomTypes} />
                  {topType && worstType && topType.room_type !== worstType.room_type && (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-900">
                      <span className="font-semibold">{topType.room_type}</span>{' '}
                      rooms earn{' '}
                      <span className="font-semibold">
                        {perBedDelta(topType, worstType)}%
                      </span>{' '}
                      more per bed per month than{' '}
                      <span className="font-semibold">{worstType.room_type}</span>{' '}
                      — worth prioritising in future room-type mix.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                  <Lightbulb className="h-4 w-4" />
                  Suggested next steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Per-room table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-accent" />
                Per-room revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Beds</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Occupied</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Revenue ({months}mo)</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        ₹/bed/mo
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Base rent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...rooms]
                      .sort(
                        (a, b) =>
                          b.revenue_per_bed_per_month_paise -
                          a.revenue_per_bed_per_month_paise,
                      )
                      .map((r) => {
                        const shortfall =
                          (r.monthly_base_rent_paise ?? 0) > 0 &&
                          r.revenue_per_bed_per_month_paise <
                            (r.monthly_base_rent_paise ?? 0);
                        return (
                          <tr key={r.room_id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{r.room_number}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {r.room_type ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {r.total_beds}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span
                                className={
                                  r.vacant_beds > 0
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }
                              >
                                {r.occupied_beds}/{r.total_beds}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatPaise(r.revenue_paise)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span
                                className={
                                  shortfall ? 'text-rose-700 font-semibold' : ''
                                }
                              >
                                {formatPaise(r.revenue_per_bed_per_month_paise)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {r.monthly_base_rent_paise
                                ? formatPaise(r.monthly_base_rent_paise)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    {rooms.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                          No rooms yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RoomTypeBars({ data }: { data: ROIRoomType[] }) {
  const max = Math.max(...data.map((d) => d.revenue_per_bed_per_month_paise), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.revenue_per_bed_per_month_paise / max) * 100);
        return (
          <div key={d.room_type} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{d.room_type}</span>
              <span className="tabular-nums">
                {formatPaise(d.revenue_per_bed_per_month_paise)}/bed/mo
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {Math.round(d.occupancy_rate * 100)}% occ · {d.rooms} rooms · {d.total_beds} beds
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function perBedDelta(top: ROIRoomType, worst: ROIRoomType): number {
  if (worst.revenue_per_bed_per_month_paise === 0) return 100;
  return Math.round(
    ((top.revenue_per_bed_per_month_paise - worst.revenue_per_bed_per_month_paise) /
      worst.revenue_per_bed_per_month_paise) *
      100,
  );
}

/**
 * Rules-based recommendations. Deliberately opinionated — the point is to give
 * owners specific "look here first" nudges rather than a wall of data.
 */
function buildSuggestions(
  rooms: ROIRoom[],
  roomTypes: ROIRoomType[],
  months: number,
): string[] {
  const out: string[] = [];

  // 1) Rooms priced below their per-bed potential.
  const shortfallRooms = rooms
    .filter(
      (r) =>
        (r.monthly_base_rent_paise ?? 0) > 0 &&
        r.total_beds > 0 &&
        r.revenue_per_bed_per_month_paise <
          Math.floor((r.monthly_base_rent_paise ?? 0) * 0.85),
    )
    .sort(
      (a, b) =>
        (b.monthly_base_rent_paise ?? 0) - b.revenue_per_bed_per_month_paise -
        ((a.monthly_base_rent_paise ?? 0) - a.revenue_per_bed_per_month_paise),
    )
    .slice(0, 3);
  if (shortfallRooms.length) {
    const list = shortfallRooms.map((r) => r.room_number).join(', ');
    out.push(
      `Rooms ${list} are collecting <85% of their base rent per bed. Verify the pricing model or refresh with move-in offers to reset the price point.`,
    );
  }

  // 2) High-vacancy rooms.
  const vacant = rooms.filter((r) => r.total_beds > 0 && r.vacant_beds >= r.total_beds);
  if (vacant.length) {
    out.push(
      `${vacant.length} room${vacant.length === 1 ? '' : 's'} sitting fully vacant (${vacant.map((v) => v.room_number).slice(0, 5).join(', ')}). Consider a short discount to hook a walk-in or list on Meta Ads.`,
    );
  }

  // 3) Room-type winner → push the mix.
  if (roomTypes.length >= 2) {
    const [top, ...rest] = roomTypes;
    const avgOfRest =
      rest.reduce((s, t) => s + t.revenue_per_bed_per_month_paise, 0) / rest.length;
    if (
      avgOfRest > 0 &&
      top.revenue_per_bed_per_month_paise / avgOfRest > 1.15
    ) {
      out.push(
        `${top.room_type} beds earn ${Math.round(
          ((top.revenue_per_bed_per_month_paise - avgOfRest) / avgOfRest) * 100,
        )}% more per bed. Next expansion or reconfiguration should skew toward ${top.room_type.toLowerCase()} layouts.`,
      );
    }
  }

  // 4) Low occupancy for a room type.
  const lowOccType = roomTypes.find((t) => t.total_beds > 0 && t.occupied_beds / t.total_beds < 0.5);
  if (lowOccType) {
    out.push(
      `${lowOccType.room_type} rooms are only ${Math.round(
        (lowOccType.occupied_beds / lowOccType.total_beds) * 100,
      )}% occupied. Investigate whether the price is too high for this type or if it's a listing/marketing gap.`,
    );
  }

  // 5) Baseline expense advice — user asked for spend control tips too.
  out.push(
    `On expenses: watch the "Recurring items" alert on Dashboard and the MoM badges in Expenses. Groceries and utilities are the usual creep — negotiate monthly Kirana bulk deals and audit power-meter recharges vs collections monthly.`,
  );

  if (months < 6) {
    out.push(
      `Consider viewing the last 6 or 12 months for a steadier per-room ROI signal — short windows are noisy when tenants churn.`,
    );
  }

  return out;
}
