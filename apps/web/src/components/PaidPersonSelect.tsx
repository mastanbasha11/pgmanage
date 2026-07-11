/**
 * Dropdown of the property's team roster (managers + collectors) for the
 * Paid To / Paid By fields on Payments + Expenses. Owners are included too —
 * they can be recipients / payers.
 *
 * "Other…" toggles into a free-text input for one-off names not in the
 * roster (relatives, walk-in payments, historic entries, etc.).
 *
 * The Payments and Expenses forms both store this as a plain string, so the
 * component's value is a string that's either a roster name or the free-text
 * override — no roster-id linkage.
 */
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTeam, type TeamRole } from '@/hooks/useTeam';

interface Props {
  value: string;
  onChange: (v: string) => void;
  propertyId?: string;
  /** Restrict roster to these roles. Default: all three. */
  roles?: TeamRole[];
  placeholder?: string;
}

const OTHER = '__other__';

export default function PaidPersonSelect({
  value,
  onChange,
  propertyId,
  roles,
  placeholder = 'Select…',
}: Props) {
  const { data } = useTeam(propertyId);
  const members = (data?.items ?? []).filter(
    (m) => !roles || roles.includes(m.role),
  );
  const names = members.map((m) => m.name);
  const inRoster = value && names.includes(value);
  // "Other" mode is: user picked Other explicitly, OR the value is a free-text
  // that isn't in the roster (legacy data).
  const [mode, setMode] = useState<'select' | 'other'>(
    value && !inRoster ? 'other' : 'select',
  );

  // Reset to select mode when the property changes and the current value
  // matches a roster name in the new list.
  useEffect(() => {
    if (value && names.includes(value)) setMode('select');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, names.length]);

  if (mode === 'other') {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a name"
        />
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-primary"
          onClick={() => {
            onChange('');
            setMode('select');
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <Select
      value={inRoster ? value : ''}
      onValueChange={(v) => {
        if (v === OTHER) {
          onChange('');
          setMode('other');
          return;
        }
        onChange(v);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {members.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No team members set up yet — add them under Properties → Team &amp; Owners.
          </div>
        ) : (
          <SelectGroup>
            <SelectLabel>Team roster</SelectLabel>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.name}>
                {m.name}{' '}
                <span className="text-[10px] text-muted-foreground">
                  · {m.role.toLowerCase()}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectSeparator />
        <SelectItem value={OTHER}>Other…</SelectItem>
      </SelectContent>
    </Select>
  );
}
