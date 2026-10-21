// Live qualification indicator for the phone-screen panel.
//
// Renders red/green as answers are typed, and a final verdict once every
// scored question is answered. It disables nothing itself — this component
// has no callbacks and cannot block a save. The one consequence a red
// verdict carries (17 Aug ruling) lives in CandidateModal: booking while
// Not qualified asks for a short typed reason before Save commits.

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  VERDICT_COPY,
  verdictClasses,
  type QualificationVerdict,
  type CriterionResult,
} from "@/lib/phoneScreenQualification";

const OUTCOME_DOT: Record<CriterionResult["outcome"], string> = {
  pass: "bg-emerald-500",
  fail: "bg-red-500",
  unanswered: "bg-muted-foreground/40",
  not_configured: "bg-muted-foreground/20",
};

const OUTCOME_TEXT: Record<CriterionResult["outcome"], string> = {
  pass: "Pass",
  fail: "Fail",
  unanswered: "Not answered",
  not_configured: "Not scored",
};

export function QualificationIndicator({ verdict }: { verdict: QualificationVerdict }) {
  const [open, setOpen] = useState(false);
  const copy = VERDICT_COPY[verdict.state];
  const scored = verdict.results.filter((r) => r.outcome !== "not_configured");

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${verdictClasses[verdict.state]}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-semibold">{copy.label}</span>
          {verdict.state !== "not_configured" && (
            <span className="text-xs opacity-80 tabular-nums">
              {verdict.answered}/{verdict.total} answered
              {verdict.failed > 0 ? ` · ${verdict.failed} failing` : ""}
            </span>
          )}
        </span>
        {scored.length > 0 && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      <p className="mt-0.5 text-xs opacity-80">{copy.blurb}</p>

      {verdict.hardGateFailures.length > 0 && (
        <p className="mt-1 text-xs font-medium">
          Failed gate{verdict.hardGateFailures.length > 1 ? "s" : ""}:{" "}
          {verdict.hardGateFailures.join(", ")}
        </p>
      )}

      {open && scored.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-current/15 pt-2">
          {scored.map((r) => (
            <li key={r.criterion.id} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${OUTCOME_DOT[r.outcome]}`}
              />
              <span className="flex-1 min-w-0">
                <span className="opacity-90">{r.criterion.label}</span>
                {r.criterion.gate_type === "hard_gate" && (
                  <span className="ml-1.5 opacity-70">(gate)</span>
                )}
                {r.criterion.gate_type === "advisory" && (
                  <span className="ml-1.5 opacity-70">(advisory)</span>
                )}
              </span>
              <span className="shrink-0 opacity-80">{OUTCOME_TEXT[r.outcome]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] opacity-70">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        You can still mark this candidate Booked or Not Suitable whatever this
        says — booking while red just asks for a short reason.
      </p>
    </div>
  );
}
