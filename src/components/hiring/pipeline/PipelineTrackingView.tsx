// Recruiting tracking view — the pipeline board with the day-of nudges, the
// still-to-call list and per-starter onboarding progress around it.
//
// Extracted verbatim from the TA portal's Candidate Tracking page (2 Sep
// ruling: Elena runs recruiting under her own login inside Ops Command, and
// the TA portal is retired). Ordering per the Run 3 ruling is preserved:
// nudges → Pipeline board → Still to call → Onboarding progress → Closed
// (Closed renders inside the board component, via belowBoardSlot).
//
// The call list opens the full screening modal (same one as the Candidates
// tab), so a call can be run and captured from right here. The board is fully
// interactive: stages drag under the same confirm guards as the CEO mount.
//
// Scores are VISIBLE here — the 17 Aug "hide scores from the TA" ruling died
// with the TA portal; this is an ops surface and Elena always saw scores.

import { useMemo, useState } from "react";
import { BellRing, ChevronDown, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { HiringPipelineView } from "@/components/hiring/pipeline/HiringPipelineView";
import { CandidateModal } from "@/components/ops-command/candidates/CandidateModal";
import { OnboardingTrackingSection } from "@/components/onboarding/OnboardingTrackingSection";
import { useCvScreenings, type CvScreening } from "@/hooks/useCvScreenings";
import { useHiringPipeline } from "@/hooks/useHiringPipeline";
import { useOfferHandoffs } from "@/hooks/useFinalInterview";

// Still-to-call = shortlisted (agent-screened or CSV-imported), and either
// untouched or marked "to call". Anyone already booked has left this list
// for the pipeline.
const NEEDS_CALLING = new Set([null, "to_call"]);

// How many rows the call list shows before "Show all".
const CALL_LIST_PREVIEW = 8;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function PipelineTrackingView() {
  const { data: screenings, isLoading: screeningsLoading } = useCvScreenings();
  const { data: pipelineResult } = useHiringPipeline();
  const { data: handoffs } = useOfferHandoffs();
  const [selected, setSelected] = useState<CvScreening | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Day-of nudges (Run 2): cards that auto-moved to Final Interview because
  // the interview is today, and candidates the CEO has passed on for the
  // offer paperwork. Both also arrive as bell notifications; this keeps them
  // visible on the working page itself.
  const notices = useMemo(() => {
    const rows = pipelineResult?.data ?? [];
    const today = todayIso();
    const interviewsToday = rows.filter(
      (c) => c.stage_key === "final_interview" && c.sdr_interview_date === today,
    );
    const passedOn = rows.filter((c) => handoffs?.has(c.id));
    // Sat the trial day, no final-interview date yet.
    const needsScheduling = rows.filter(
      (c) => c.stage_key === "trial_day" && !c.sdr_interview_date,
    );
    // Chase list (Marcus's spec): at Final Interview with no CV on file.
    // Naturally persistent — recomputed from live pipeline data on every
    // load until the CV is uploaded from the candidate's card.
    const missingCv = rows.filter(
      (c) => c.stage_key === "final_interview" && !c.cv_file,
    );
    return { interviewsToday, passedOn, needsScheduling, missingCv };
  }, [pipelineResult, handoffs]);

  const toCall = useMemo(() => {
    // Same promoted-exclusion rule as the Candidates tab: anyone whose linked
    // candidates row has a real stage lives on the board, not the call list.
    const promotedScreeningIds = new Set<string>();
    const promotedCandidateIds = new Set<string>();
    for (const c of pipelineResult?.data ?? []) {
      if (!c.stage_key || c.stage_key === "screening") continue;
      if (c.cv_screening_id) promotedScreeningIds.add(c.cv_screening_id);
      promotedCandidateIds.add(c.id);
    }
    return (screenings ?? []).filter((s) => {
      if (s.bucket !== "SHORTLIST" || !NEEDS_CALLING.has(s.review_status)) return false;
      if (promotedScreeningIds.has(s.id)) return false;
      const linked = (s as CvScreening & { candidate_id?: string | null }).candidate_id;
      return !linked || !promotedCandidateIds.has(linked);
    });
  }, [screenings, pipelineResult]);

  const visible = showAll ? toCall : toCall.slice(0, CALL_LIST_PREVIEW);
  const hiddenCount = toCall.length - visible.length;

  // The modal candidate tracks the cache so a save reflects immediately.
  const selectedLive = selected
    ? (screenings ?? []).find((s) => s.id === selected.id) ?? selected
    : null;

  // Slotted below the board (Run 3 ordering: Pipeline → To call →
  // Onboarding → Closed; Closed renders inside the board component).
  const stillToCallSection = (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Still to call</h3>
        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">
          {toCall.length}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Shortlisted, not yet booked — click a row to run the screen
        </span>
      </header>

      {screeningsLoading ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
      ) : toCall.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nobody is waiting on a call.</p>
      ) : (
        <>
          <ul
            className={cn(
              "divide-y divide-border",
              showAll && "max-h-80 overflow-y-auto",
            )}
          >
            {visible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{s.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.phone ?? s.email ?? "No contact details on the CV"}
                    </p>
                  </div>
                  {typeof s.score === "number" && (
                    <span className="shrink-0 tabular-nums text-xs font-medium text-muted-foreground">
                      {s.score}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    To call
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || showAll) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")}
              />
              {showAll ? "Show fewer" : `Show all ${toCall.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {(notices.interviewsToday.length > 0 ||
        notices.passedOn.length > 0 ||
        notices.needsScheduling.length > 0 ||
        notices.missingCv.length > 0) && (
        <div className="space-y-2">
          {notices.missingCv.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                <span className="font-medium">
                  {notices.missingCv.length} candidate
                  {notices.missingCv.length === 1 ? "" : "s"} at Final
                  Interview {notices.missingCv.length === 1 ? "has" : "have"}{" "}
                  no CV — chase it up:
                </span>{" "}
                {notices.missingCv
                  .map((c) => `${c.first_name} ${c.last_name}`.trim())
                  .join(", ")}{" "}
                — open the card to upload it.
              </p>
            </div>
          )}
          {notices.needsScheduling.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                <span className="font-medium">Final interview needs a date:</span>{" "}
                {notices.needsScheduling
                  .map((c) => `${c.first_name} ${c.last_name}`.trim())
                  .join(", ")}{" "}
                — the CEO passed the trial; open the glowing card to book it.
              </p>
            </div>
          )}
          {notices.interviewsToday.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <p className="text-sm text-foreground">
                <span className="font-medium">Final interview today:</span>{" "}
                {notices.interviewsToday
                  .map((c) => `${c.first_name} ${c.last_name}`.trim())
                  .join(", ")}{" "}
                — moved to Final Interview automatically.
              </p>
            </div>
          )}
          {notices.passedOn.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                <span className="font-medium">Passed on by the CEO:</span>{" "}
                {notices.passedOn
                  .map((c) => `${c.first_name} ${c.last_name}`.trim())
                  .join(", ")}{" "}
                — open the card to fill the wage and start date and send the offer.
              </p>
            </div>
          )}
        </div>
      )}

      {/* The pipeline board — same component the CEO uses, with the same
          drag + side-panel actions enabled. The Still-to-call list and
          Onboarding progress slot in between the board and its Closed
          section (Run 3 ordering). */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Pipeline</h2>
        <HiringPipelineView
          canAct
          belowBoardSlot={
            <>
              {stillToCallSection}
              <OnboardingTrackingSection />
            </>
          }
        />
      </div>

      {/* The same screening modal as the Candidates tab — booking from here
          promotes to the pipeline exactly the same way. */}
      <CandidateModal
        candidate={selectedLive}
        open={selected !== null}
        showScore
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
