// Elena's checklist block inside the starter sheet (3 Sep, R8). Tick boxes
// over hr_starter_checklist_items, materialised from the enabled templates
// the first time the sheet opens. Also the start-date field (R6) that feeds
// the starter's countdown chip.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useHrChecklistItems,
  useHrChecklistTemplates,
  useMaterialiseChecklist,
  useToggleChecklistItem,
} from "@/hooks/useHrStarterChecklist";
import { useSetStartDate, type OnboardingRecord } from "@/hooks/useEmployeeOnboarding";

export function StarterChecklist({ onboardingId }: { onboardingId: string }) {
  const { data: templates } = useHrChecklistTemplates();
  const { data: items } = useHrChecklistItems();
  const materialise = useMaterialiseChecklist();
  const toggle = useToggleChecklistItem();
  const attempted = useRef<string | null>(null);

  const migrationPending = !!templates?.migrationPending || !!items?.migrationPending;
  const mine = useMemo(
    () => (items?.data ?? []).filter((i) => i.employee_onboarding_id === onboardingId),
    [items, onboardingId],
  );
  const order = useMemo(() => new Map((templates?.data ?? []).map((t) => [t.key, t.sort_order])), [templates]);
  const sorted = useMemo(
    () => [...mine].sort((a, b) => (order.get(a.template_key) ?? 999) - (order.get(b.template_key) ?? 999)),
    [mine, order],
  );

  // First open: create the missing items from the enabled templates.
  useEffect(() => {
    if (migrationPending || !templates || !items) return;
    const enabled = templates.data.filter((t) => t.enabled);
    const have = new Set(mine.map((i) => i.template_key));
    const missing = enabled.some((t) => !have.has(t.key));
    if (!missing || attempted.current === onboardingId || materialise.isPending) return;
    attempted.current = onboardingId;
    materialise.mutate({ onboardingId, templates: templates.data }, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't set up the checklist"),
    });
  }, [migrationPending, templates, items, mine, onboardingId, materialise]);

  const done = sorted.filter((i) => i.done_at).length;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-b-fuchsia-500/20 bg-fuchsia-500/10 px-3.5 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">Elena&apos;s checklist</h4>
        {!migrationPending && sorted.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">{done}/{sorted.length}</span>
        )}
      </header>
      {migrationPending ? (
        <p className="px-3.5 py-3 text-xs text-amber-700">
          Needs the 3 Sep migration (20260903160000_sdr_deck_hr_checklist.sql) before it can be used.
        </p>
      ) : sorted.length === 0 ? (
        <p className="flex items-center gap-2 px-3.5 py-3 text-xs text-muted-foreground">
          {materialise.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {materialise.isPending ? "Setting up the checklist" : "No checklist items. Add some in Dev Center → Onboarding Flow → HR checklist."}
        </p>
      ) : (
        <ul className="space-y-1 px-3.5 py-3">
          {sorted.map((item) => {
            const checked = !!item.done_at;
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 hover:bg-muted/50">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) =>
                      toggle.mutate({ id: item.id, done: v === true }, {
                        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
                      })
                    }
                  />
                  <span className={cn("text-sm", checked ? "text-muted-foreground line-through" : "text-foreground")}>
                    {item.label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Planned first day: drives the starter's countdown chip (R6). */
export function StartDateField({ record, ready }: { record: OnboardingRecord; ready: boolean }) {
  const setStart = useSetStartDate();
  const [value, setValue] = useState(record.start_date ?? "");
  useEffect(() => setValue(record.start_date ?? ""), [record.id, record.start_date]);

  const save = (next: string) => {
    const normalised = next || null;
    if ((record.start_date ?? null) === normalised) return;
    setStart.mutate({ onboardingId: record.id, startDate: normalised }, {
      onSuccess: () => toast.success(normalised ? "Start date saved" : "Start date cleared"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the start date"),
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
        <CalendarDays className="h-3.5 w-3.5 text-primary" /> Start date
      </label>
      {ready ? (
        <>
          <Input
            type="date"
            className="mt-2 h-9 max-w-[220px]"
            value={value}
            disabled={setStart.isPending}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => save(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Their first day. The starter sees a countdown on their onboarding page.
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-amber-700">
          Needs the 3 Sep migration (20260903160000_sdr_deck_hr_checklist.sql).
        </p>
      )}
    </div>
  );
}
