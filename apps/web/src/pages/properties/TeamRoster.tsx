/**
 * Per-property team roster.
 *
 * Owners (with their share % — must sum to 100 across active owners),
 * Managers, and Collectors. Collector + Manager names populate the Paid To /
 * Paid By dropdowns on payment + expense flows. Owners get a share of the
 * profit split on the Dashboard.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Pencil } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useTeam,
  useCreateTeamMember,
  useUpdateTeamMember,
  useDeleteTeamMember,
  type TeamMember,
  type TeamRole,
} from '@/hooks/useTeam';
import { useToast } from '@/hooks/useToast';
import { getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function TeamRoster({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useTeam(propertyId);
  const { canAccessFinancials } = useAuthStore();
  const editable = canAccessFinancials();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const del = useDeleteTeamMember();
  const { toast } = useToast();

  async function handleRemove(m: TeamMember) {
    if (!window.confirm(`Remove ${m.name} from the roster?`)) return;
    try {
      await del.mutateAsync(m.id);
      toast({ title: 'Removed', description: m.name });
    } catch (err: unknown) {
      toast({ title: 'Failed', description: getApiError(err), variant: 'destructive' });
    }
  }

  const owners = (data?.items ?? []).filter((m) => m.role === 'OWNER');
  const managers = (data?.items ?? []).filter((m) => m.role === 'MANAGER');
  const collectors = (data?.items ?? []).filter((m) => m.role === 'COLLECTOR');
  const ownerShareTotal = owners.reduce((s, o) => s + (o.share_pct ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team &amp; Owners</h3>
          <p className="text-xs text-muted-foreground">
            Owners take a share of the profit. Managers + Collectors appear in the
            Paid To / Paid By dropdowns on Rent and Expenses.
          </p>
        </div>
        {editable && (
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <Section
            title="Owners"
            subtitle={
              owners.length === 0
                ? 'No owners set — profit split will be uncredited.'
                : `Total share: ${ownerShareTotal}% ${
                    ownerShareTotal === 100
                      ? '✓'
                      : ownerShareTotal < 100
                      ? '(fill up to 100%)'
                      : '(over 100 — please fix)'
                  }`
            }
            members={owners}
            onEdit={setEditing}
            onDelete={editable ? handleRemove : undefined}
          />
          <Section
            title="Managers"
            subtitle="Property managers — collect rent, appear in Paid To."
            members={managers}
            onEdit={setEditing}
            onDelete={editable ? handleRemove : undefined}
          />
          <Section
            title="Collectors"
            subtitle="Anyone who collects cash — appear in Paid To / Paid By dropdowns."
            members={collectors}
            onEdit={setEditing}
            onDelete={editable ? handleRemove : undefined}
          />
        </>
      )}

      {showAdd && (
        <TeamMemberDialog
          propertyId={propertyId}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <TeamMemberDialog
          propertyId={propertyId}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  members,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  members: TeamMember[];
  onEdit: (m: TeamMember) => void;
  onDelete?: (m: TeamMember) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {members.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-xs text-muted-foreground">
            None yet
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <Card key={m.id} className="hover:border-accent transition-colors">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{m.name}</p>
                    {m.role === 'OWNER' && m.share_pct != null && (
                      <Badge variant="outline" className="text-[10px]">
                        {m.share_pct}%
                      </Badge>
                    )}
                  </div>
                  {m.phone && (
                    <p className="text-[11px] text-muted-foreground">{m.phone}</p>
                  )}
                  {m.notes && (
                    <p className="text-[11px] text-muted-foreground">{m.notes}</p>
                  )}
                </div>
                {onDelete && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => onEdit(m)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => onDelete(m)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamMemberDialog({
  propertyId,
  existing,
  onClose,
}: {
  propertyId: string;
  existing?: TeamMember;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [role, setRole] = useState<TeamRole>(existing?.role ?? 'COLLECTOR');
  const [sharePct, setSharePct] = useState<string>(
    existing?.share_pct != null ? String(existing.share_pct) : '',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const { toast } = useToast();
  const create = useCreateTeamMember(propertyId);
  const update = useUpdateTeamMember();

  async function submit() {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      share_pct: role === 'OWNER' && sharePct ? Number(sharePct) : undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: payload });
      } else {
        await create.mutateAsync(payload);
      }
      toast({ title: existing ? 'Updated' : 'Added', description: name });
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Failed', description: getApiError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">
          {existing ? 'Edit member' : 'Add team member'}
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="COLLECTOR">Collector</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {role === 'OWNER' && (
            <div>
              <Label>Share % — owners' shares must total 100</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={sharePct}
                onChange={(e) => setSharePct(e.target.value)}
                placeholder="e.g. 50"
              />
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {create.isPending || update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
