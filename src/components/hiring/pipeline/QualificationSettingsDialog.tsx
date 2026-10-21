// Set the phone-screen qualification criteria.
//
// This is what makes "the mechanism now, the values later" real: criteria are
// rows in qualification_criteria, so the bar moves without a deploy. Writes
// are RLS-gated to leadership (CEO capability / admin / dev) — the TA reads
// the criteria she is measured against but cannot edit them.
//
// Final-interview scoring is deliberately NOT here: there is nowhere to store
// final-interview answers yet, so persisting criteria that can never be
// evaluated would be building a dial connected to nothing. See
// AUDIT_TA_PORTAL.md §6.10.

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useQualificationCriteria,
  useUpdateQualificationCriterion,
} from "@/hooks/useQualificationCriteria";
import type {
  CriterionOperator,
  GateType,
  QualificationCriterion,
} from "@/lib/phoneScreenQualification";

const GATE_TYPES: { value: GateType; label: string; hint: string }[] = [
  { value: "hard_gate", label: "Gate", hint: "Failing it fails the verdict outright" },
  { value: "weighted", label: "Weighted", hint: "Contributes its weight to the score" },
  { value: "advisory", label: "Advisory", hint: "Shown to the caller, never scored" },
];

const OPERATORS: { value: CriterionOperator; label: string; needs: "none" | "one" | "two" | "text" }[] = [
  { value: "is_true", label: "Answer is Yes", needs: "none" },
  { value: "is_false", label: "Answer is No", needs: "none" },
  { value: "not_empty", label: "Answered at all", needs: "none" },
  { value: "gte", label: "At least", needs: "one" },
  { value: "lte", label: "At most", needs: "one" },
  { value: "between", label: "Between", needs: "two" },
  { value: "eq", label: "Exactly", needs: "text" },
];

const NO_OPERATOR = "__none__";

function CriterionEditor({
  criterion,
  labelEditable = false,
}: {
  criterion: QualificationCriterion;
  /** Final-interview rows ARE the questions, so their wording is editable.
      Phone-screen labels mirror the hard-coded modal and stay fixed. */
  labelEditable?: boolean;
}) {
  const update = useUpdateQualificationCriterion();
  const [draft, setDraft] = useState(criterion);

  const opSpec = OPERATORS.find((o) => o.value === draft.operator);
  const dirty = JSON.stringify(draft) !== JSON.stringify(criterion);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: criterion.id,
        enabled: draft.enabled,
        gate_type: draft.gate_type,
        operator: draft.operator,
        threshold_numeric: draft.threshold_numeric,
        threshold_numeric_max: draft.threshold_numeric_max,
        expected_text: draft.expected_text,
        weight: draft.weight,
        rationale: draft.rationale,
        ...(labelEditable ? { label: draft.label } : {}),
      });
      toast.success("Criterion saved");
    } catch (err) {
      toast.error(
        `Couldn't save: ${err instanceof Error ? err.message : "unknown error"}. Has migration M5 been run?`,
      );
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {labelEditable ? (
            <Input
              className="h-8 text-sm font-medium"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          ) : (
            <p className="text-sm font-medium text-foreground">{criterion.label}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{criterion.question_key}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={`en-${criterion.id}`} className="text-xs text-muted-foreground">
            Scored
          </Label>
          <Switch
            id={`en-${criterion.id}`}
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
        </div>
      </div>

      {draft.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Type</Label>
              <Select
                value={draft.gate_type}
                onValueChange={(v) => setDraft({ ...draft, gate_type: v as GateType })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GATE_TYPES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Condition</Label>
              <Select
                value={draft.operator ?? NO_OPERATOR}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    operator: v === NO_OPERATOR ? null : (v as CriterionOperator),
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OPERATOR}>— Not set —</SelectItem>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(opSpec?.needs === "one" || opSpec?.needs === "two") && (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Value</Label>
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={draft.threshold_numeric ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      threshold_numeric: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              {opSpec.needs === "two" && (
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">and</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={draft.threshold_numeric_max ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        threshold_numeric_max:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}

          {opSpec?.needs === "text" && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Expected answer</Label>
              <Input
                className="h-8 text-sm"
                value={draft.expected_text ?? ""}
                onChange={(e) => setDraft({ ...draft, expected_text: e.target.value || null })}
              />
            </div>
          )}

          {draft.gate_type === "weighted" && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Weight</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                className="h-8 w-24 text-sm"
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) || 0 })}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Rationale — why this criterion exists
            </Label>
            <Input
              className="h-8 text-sm"
              value={draft.rationale ?? ""}
              onChange={(e) => setDraft({ ...draft, rationale: e.target.value || null })}
            />
          </div>
        </>
      )}

      {dirty && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(criterion)}>
            Revert
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function QualificationSettingsDialog() {
  const [open, setOpen] = useState(false);
  const { data: result } = useQualificationCriteria("phone_screen");
  const criteria = result?.data ?? [];
  const migrationPending = result?.migrationPending ?? false;
  // The CEO's final-interview framework (Run 2) — same table, second
  // framework value; rows are seeded by the 2026-08-18 migration.
  const { data: fiResult } = useQualificationCriteria("final_interview");
  const fiCriteria = fiResult?.data ?? [];

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" />
        Qualification criteria
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-1.5 pr-8">
              <DialogTitle>Qualification criteria</DialogTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="How qualification criteria work"
                  >
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-96 max-h-[70vh] overflow-y-auto text-sm space-y-3">
                  <div>
                    <h4 className="font-semibold mb-1.5">How this works, in plain English</h4>
                    <p>
                      Each row below is one question. As the answers are typed in during a
                      phone screen or a final interview, the app compares them against these
                      rules and shows a live red/green box: <strong>green</strong> means
                      qualified, <strong>red</strong> means not qualified.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1.5">Setting up a question</h4>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>
                        Flick <strong>Scored</strong> on. A question that isn&apos;t scored is
                        still asked — it just doesn&apos;t count.
                      </li>
                      <li>
                        Pick a <strong>Type</strong>: a <strong>Gate</strong> is a
                        deal-breaker — fail it and the whole verdict goes red, no matter what
                        else. <strong>Weighted</strong> questions add up: pass more than half
                        the weight and the verdict is green. <strong>Advisory</strong> is
                        shown to the interviewer but never counted.
                      </li>
                      <li>
                        Pick a <strong>Condition</strong> — what counts as a pass. For yes/no
                        questions that&apos;s &quot;Answer is Yes&quot; (or No). For numbers you can say
                        &quot;At least 100 dials&quot;, &quot;At most 30 days&quot;, or &quot;Between X and Y&quot;.
                      </li>
                      <li>
                        For weighted questions, a bigger <strong>Weight</strong> makes that
                        question matter more than the others.
                      </li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1.5">The two question sets</h4>
                    <p>
                      <strong>Phone screen</strong> — the questions the TA asks on the first
                      call. Their wording is fixed here (it mirrors the call sheet); you tune
                      how they&apos;re scored.
                    </p>
                    <p className="mt-1.5">
                      <strong>Final interview</strong> — the CEO&apos;s questions. Here the
                      wording itself is editable too, so type the question exactly as
                      you&apos;d ask it. It appears word-for-word in the candidate&apos;s
                      panel at the Final Interview stage.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1.5">Good to know</h4>
                    <p>
                      A red verdict never blocks anyone — booking a red candidate just asks
                      for a short written reason. Changes here apply instantly, no deploy
                      needed.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <DialogDescription>
              What makes a candidate qualified — the phone-screen questions the TA scores,
              and the CEO&apos;s final-interview questions. Changes take effect immediately.
              The verdict advises only — it never stops anyone booking or rejecting.
            </DialogDescription>
          </DialogHeader>

          {migrationPending ? (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                The criteria table doesn&apos;t exist yet. Run section <strong>M5</strong> of{" "}
                <code className="text-xs">
                  docs/pending-migrations/2026-08-14-ta-portal-and-hiring-pipeline.sql
                </code>
                .
              </p>
            </div>
          ) : criteria.length === 0 ? (
            <p className="text-sm text-muted-foreground">No criteria rows found.</p>
          ) : (
            <div className="space-y-2.5">
              <p className="text-sm font-medium text-foreground">Phone-screen questions</p>
              {criteria.map((c) => (
                <CriterionEditor key={c.id} criterion={c} />
              ))}
            </div>
          )}

          {/* Final-interview framework — these rows ARE the questions the
              CEO answers in the candidate panel at the Final Interview
              stage, so relabelling one here rewords the question there. */}
          <div className="mt-4 space-y-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Final-interview questions</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Asked by the CEO at the final interview. The label is the question as shown;
                gates and weights drive the red/green verdict, same as the phone screen.
              </p>
            </div>
            {fiCriteria.length === 0 ? (
              <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-foreground">
                  No final-interview questions yet — run{" "}
                  <code className="text-xs">
                    docs/pending-migrations/2026-08-18-final-interview-and-offer-handoff.sql
                  </code>{" "}
                  to seed the editable starter set.
                </p>
              </div>
            ) : (
              fiCriteria.map((c) => <CriterionEditor key={c.id} criterion={c} labelEditable />)
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
