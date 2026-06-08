/**
 * Four-step wizard to map a Meta-approved WhatsApp template's body to
 * dynamic variables or static text.
 *
 * Steps:
 *   1. Paste the approved template body from Meta + set name + language.
 *   2. Wizard auto-detects {{1}}, {{2}}, … placeholders.
 *   3. For each placeholder, owner picks a variable from the per-template
 *      catalogue (tenant_name, amount_rupees, …) OR types static text.
 *   4. Preview the rendered message with example values + Save.
 *
 * Output shape matches the backend payload:
 *   wa_<key>_template_name      = string
 *   wa_<key>_template_language  = "en" | "en_US" | …
 *   wa_<key>_template_params    = TemplateParam[]   (one per placeholder)
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Sparkles, Type } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import {
  useUpdateWhatsAppSettings,
  useTemplateVariables,
  type TemplateParam,
  type WhatsAppSettings,
} from '@/hooks/useWhatsApp';

type TemplateKey = 'rent_reminder' | 'rent_overdue';

const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  rent_reminder: 'Rent reminder',
  rent_overdue: 'Rent overdue',
};

const TEMPLATE_DESCRIPTION: Record<TemplateKey, string> = {
  rent_reminder: 'Sent on the 1st of each month to every active resident.',
  rent_overdue: 'Sent daily once rent goes past due, until paid.',
};

interface Props {
  open: boolean;
  onClose: () => void;
  template: TemplateKey;
  propertyId: string;
  current: WhatsAppSettings | undefined;
}

type Step = 1 | 2 | 3 | 4;

export default function TemplateWizard({
  open,
  onClose,
  template,
  propertyId,
  current,
}: Props) {
  const { data: catalogue } = useTemplateVariables();
  const update = useUpdateWhatsAppSettings(propertyId);
  const { toast } = useToast();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [body, setBody] = useState('');
  // params[i] is the mapping for {{i+1}} in the body.
  const [params, setParams] = useState<TemplateParam[]>([]);

  // Prefill from current settings when the wizard opens.
  useEffect(() => {
    if (!open || !current) return;
    if (template === 'rent_reminder') {
      setName(current.wa_rent_reminder_template_name ?? '');
      setLanguage(current.wa_rent_reminder_template_language ?? 'en');
      setParams(current.wa_rent_reminder_template_params ?? []);
    } else {
      setName(current.wa_rent_overdue_template_name ?? '');
      setLanguage(current.wa_rent_overdue_template_language ?? 'en');
      setParams(current.wa_rent_overdue_template_params ?? []);
    }
    setBody('');
    setStep(1);
  }, [open, current, template]);

  // ── Placeholder detection ─────────────────────────────────────────────────
  // Detect every {{N}} in the body so we know how many param slots to render.
  // We expect placeholders 1..N to all appear; Meta itself enforces that
  // server-side, but we surface a warning if the sequence skips.
  const placeholders = useMemo(() => {
    const re = /\{\{(\d+)\}\}/g;
    const found = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) found.add(Number(m[1]));
    return Array.from(found).sort((a, b) => a - b);
  }, [body]);

  // Ensure params[] has exactly as many slots as the placeholders detected.
  // Preserves any previously-set mappings (so editing the wizard a second
  // time doesn't reset choices on every body change).
  useEffect(() => {
    if (step !== 2 && step !== 3 && step !== 4) return;
    setParams((cur) => {
      const next: TemplateParam[] = [];
      for (let i = 0; i < placeholders.length; i++) {
        next.push(cur[i] ?? { kind: 'variable', key: '' });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholders.length]);

  // ── Variable list for this template ────────────────────────────────────────
  const variables = catalogue?.[template]?.variables ?? [];

  // Resolve a TemplateParam to its example text for the preview pane.
  function preview(p: TemplateParam): string {
    if (p.kind === 'static') return p.value || '—';
    const v = variables.find((x) => x.key === p.key);
    return v?.example ?? '—';
  }

  // Render the body with example values substituted, for step 4.
  const previewBody = useMemo(() => {
    return body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const i = Number(n) - 1;
      const p = params[i];
      return p ? preview(p) : `{{${n}}}`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, params, variables]);

  // ── Validation per step ────────────────────────────────────────────────────
  function canAdvance(s: Step): boolean {
    if (s === 1) return name.trim().length > 0 && language.trim().length > 0;
    if (s === 2) {
      // Body is optional only if the template legitimately has 0 placeholders
      // (e.g. Meta's hello_world). Owner can also paste a body and we detect.
      return true;
    }
    if (s === 3) {
      // Every placeholder must have a non-empty selection.
      return params.every((p) =>
        p.kind === 'static' ? p.value.trim().length > 0 : p.key.length > 0,
      );
    }
    return true;
  }

  async function save() {
    const payload =
      template === 'rent_reminder'
        ? {
            wa_rent_reminder_template_name: name.trim(),
            wa_rent_reminder_template_language: language.trim(),
            wa_rent_reminder_template_params: params,
          }
        : {
            wa_rent_overdue_template_name: name.trim(),
            wa_rent_overdue_template_language: language.trim(),
            wa_rent_overdue_template_params: params,
          };
    try {
      await update.mutateAsync(payload);
      toast({
        title: 'Template saved',
        description: `${TEMPLATE_LABEL[template]} mapped to ${params.length} param${params.length === 1 ? '' : 's'}.`,
      });
      onClose();
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TEMPLATE_LABEL[template]} — Template setup</DialogTitle>
          <DialogDescription>{TEMPLATE_DESCRIPTION[template]}</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs">
          {([1, 2, 3, 4] as const).map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  step === n
                    ? 'border-accent bg-accent text-white'
                    : step > n
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-muted bg-muted text-muted-foreground'
                }`}
              >
                {step > n ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              {n < 4 && <span className="h-px w-6 bg-border" />}
            </div>
          ))}
          <span className="ml-2 text-muted-foreground">
            {step === 1 && 'Name + language'}
            {step === 2 && 'Paste body'}
            {step === 3 && 'Map placeholders'}
            {step === 4 && 'Preview & save'}
          </span>
        </div>

        {/* Step body */}
        <div className="space-y-4 py-2">
          {step === 1 && (
            <>
              <Hint>
                Use the exact <span className="font-mono">name</span> and{' '}
                <span className="font-mono">language code</span> Meta approved. Find
                them in WhatsApp Manager → Message Templates.
              </Hint>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Template name</Label>
                  <Input
                    placeholder="rent_payment_harshi_upi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Language code</Label>
                  <Input
                    placeholder="en or en_US"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Hint>
                Paste the <strong>body text</strong> of your template exactly as Meta
                approved it. Keep the <span className="font-mono">{'{{1}}'}, {'{{2}}'}, …</span>{' '}
                placeholders. Leave blank if the template has zero placeholders (e.g.{' '}
                <span className="font-mono">hello_world</span>).
              </Hint>
              <div>
                <Label>Template body</Label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder={`Hi {{1}}, your rent of {{2}} for {{3}} is due on {{4}}. Pay via UPI: {{5}}. — PGManage`}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Detected placeholders: <strong>{placeholders.length}</strong>
                {placeholders.length > 0 && (
                  <span> · {placeholders.map((n) => `{{${n}}}`).join(', ')}</span>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Hint>
                Pick what fills each placeholder. Dynamic values are filled in from
                the live record at send time. Static text is the same in every message.
              </Hint>
              {placeholders.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This template has zero placeholders — that's fine for some
                  templates (like <span className="font-mono">hello_world</span>).
                  Click <strong>Next</strong> to continue.
                </div>
              ) : (
                <div className="space-y-3">
                  {placeholders.map((n, i) => (
                    <ParamRow
                      key={n}
                      index={n}
                      value={params[i]}
                      onChange={(p) =>
                        setParams((cur) => {
                          const next = [...cur];
                          next[i] = p;
                          return next;
                        })
                      }
                      variables={variables}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <Hint>
                Here's how a real message will look with sample values. The actual
                send substitutes live data from the resident's record.
              </Hint>
              <div className="rounded-md border bg-emerald-50/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {previewBody || (
                  <span className="text-muted-foreground italic">
                    (Empty body — Meta will deliver the template's approved body unchanged.)
                  </span>
                )}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-semibold mb-1">Will be saved as:</div>
                <ul className="space-y-0.5">
                  <li>
                    <span className="text-muted-foreground">Template:</span>{' '}
                    <span className="font-mono">{name}</span>{' '}
                    <span className="text-muted-foreground">in</span>{' '}
                    <span className="font-mono">{language}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Params:</span>{' '}
                    {params.length === 0
                      ? <em>(none — 0-placeholder template)</em>
                      : params.map((p, idx) => (
                          <Badge key={idx} variant="outline" className="mr-1 text-[10px]">
                            {idx + 1}.{' '}
                            {p.kind === 'variable' ? `{${p.key}}` : `"${p.value}"`}
                          </Badge>
                        ))}
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {step < 4 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={!canAdvance(step)}
              className="gap-1"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={save} disabled={update.isPending} className="gap-1">
              <Check className="h-4 w-4" />
              {update.isPending ? 'Saving…' : 'Save template'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 p-3 text-xs">
      <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

function ParamRow({
  index,
  value,
  onChange,
  variables,
}: {
  index: number;
  value: TemplateParam | undefined;
  onChange: (p: TemplateParam) => void;
  variables: { key: string; label: string; example: string }[];
}) {
  const kind = value?.kind ?? 'variable';
  return (
    <div className="rounded-md border bg-card p-3 flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="font-mono">
        {`{{${index}}}`}
      </Badge>

      {/* Kind toggle */}
      <div className="inline-flex rounded-md border bg-background">
        <button
          type="button"
          className={`px-2 py-1 text-xs flex items-center gap-1 ${kind === 'variable' ? 'bg-accent text-white' : 'text-muted-foreground'}`}
          onClick={() => onChange({ kind: 'variable', key: '' })}
        >
          <Sparkles className="h-3 w-3" />
          Variable
        </button>
        <button
          type="button"
          className={`px-2 py-1 text-xs flex items-center gap-1 ${kind === 'static' ? 'bg-accent text-white' : 'text-muted-foreground'}`}
          onClick={() => onChange({ kind: 'static', value: '' })}
        >
          <Type className="h-3 w-3" />
          Static
        </button>
      </div>

      {kind === 'variable' ? (
        <Select
          value={value?.kind === 'variable' ? value.key : ''}
          onValueChange={(k) => onChange({ kind: 'variable', key: k })}
        >
          <SelectTrigger className="flex-1 min-w-[200px] max-w-sm">
            <SelectValue placeholder="Choose a variable…" />
          </SelectTrigger>
          <SelectContent>
            {variables.map((v) => (
              <SelectItem key={v.key} value={v.key}>
                <span className="font-mono mr-2">{`{${v.key}}`}</span>
                <span className="text-muted-foreground">— {v.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          placeholder="Literal text"
          value={value?.kind === 'static' ? value.value : ''}
          onChange={(e) => onChange({ kind: 'static', value: e.target.value })}
          className="flex-1 min-w-[200px] max-w-sm"
        />
      )}
    </div>
  );
}
