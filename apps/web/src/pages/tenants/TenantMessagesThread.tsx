/**
 * Per-tenant WhatsApp thread.
 *
 * Reads all notification_log rows for one tenant and renders a
 * chat-style transcript — outbound rows aligned right (green), inbound
 * `inbound:*` rows aligned left (grey). Precise date+time on every row so
 * owners can eyeball exactly when a reply came in vs when the reminder
 * fired.
 *
 * Not a live chat — the reply flow (send from app inside the 24-hour
 * WhatsApp session window) is Phase B. Today this is a read-only history.
 */
import { useMemo } from 'react';
import { MessageCircle, CheckCheck, XCircle, Clock } from 'lucide-react';
import { useNotifications, type NotificationEntry } from '@/hooks/useNotifications';
import { Card, CardContent } from '@/components/ui/card';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** "13 Jul 26 · 02:07 PM" */
function fmtAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${DATE_FMT.format(d)} · ${TIME_FMT.format(d)}`;
}

/** Group by calendar day for the sticky day separators. */
function groupByDay(items: NotificationEntry[]): [string, NotificationEntry[]][] {
  const map = new Map<string, NotificationEntry[]>();
  for (const m of items) {
    const iso = m.sent_at ?? m.created_at;
    const key = iso ? DATE_FMT.format(new Date(iso)) : '—';
    const arr = map.get(key) ?? [];
    arr.push(m);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

function DeliveryDots({ m }: { m: NotificationEntry }) {
  if (m.status === 'FAILED') return <XCircle className="h-3.5 w-3.5 text-rose-500" />;
  if (m.status === 'PENDING') return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  const seen = m.delivery_status === 'read';
  return (
    <CheckCheck
      className={
        seen
          ? 'h-3.5 w-3.5 text-sky-500'
          : m.delivery_status === 'delivered' || m.delivered_at
          ? 'h-3.5 w-3.5 text-emerald-600'
          : 'h-3.5 w-3.5 text-muted-foreground'
      }
    />
  );
}

export default function TenantMessagesThread({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { data, isLoading } = useNotifications({
    recipient_id: tenantId,
    channel: 'WHATSAPP',
    page_size: 200,
  });

  // Sort ascending so the oldest message is at the top — reads like a chat.
  const messages = useMemo(() => {
    const items = [...(data?.items ?? [])];
    items.sort((a, b) => {
      const ta = new Date(a.sent_at ?? a.created_at ?? 0).getTime();
      const tb = new Date(b.sent_at ?? b.created_at ?? 0).getTime();
      return ta - tb;
    });
    return items;
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <MessageCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No WhatsApp messages exchanged with {tenantName} yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByDay(messages);

  return (
    <div className="space-y-4">
      {grouped.map(([day, dayMsgs]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {day}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            {dayMsgs.map((m) => {
              const isInbound = (m.template_name ?? '').startsWith('inbound:');
              const text = m.rendered_message || m.message_body || '';
              const at = m.sent_at ?? m.created_at;
              return (
                <div
                  key={m.id}
                  className={
                    isInbound ? 'flex justify-start' : 'flex justify-end'
                  }
                >
                  <div
                    className={
                      isInbound
                        ? 'max-w-[80%] rounded-2xl rounded-bl-sm border bg-muted/60 px-3 py-2'
                        : 'max-w-[80%] rounded-2xl rounded-br-sm border border-emerald-200 bg-emerald-50/60 px-3 py-2'
                    }
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isInbound
                        ? `Reply · ${m.template_name?.replace('inbound:', '') || 'general'}`
                        : m.template_name || '—'}
                    </p>
                    {text ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                        {text}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm italic text-muted-foreground">
                        (no message body)
                      </p>
                    )}
                    {m.error_message && (
                      <p className="mt-1 text-[11px] text-rose-700">
                        Error: {m.error_message}
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      <span>{fmtAt(at)}</span>
                      {!isInbound && <DeliveryDots m={m} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
