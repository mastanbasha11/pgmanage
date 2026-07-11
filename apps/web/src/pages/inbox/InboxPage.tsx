/**
 * Tenant Inbox — coming soon.
 *
 * The unified tenant-event feed (complaints, notice-to-vacate, KYC updates,
 * feedback) is still under construction — the backend hooks + resident-app
 * emitters exist but the reviewed-and-shipped UI is queued behind other work.
 * See project memory [[project-admin-tenant-inbox]].
 */
import { Inbox as InboxIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function InboxPage() {
  return (
    <div className="p-6">
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <InboxIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">Coming soon</p>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            One place to see everything your residents raise —
            complaints, notice-to-vacate, KYC updates, feedback. Wiring
            it up next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
