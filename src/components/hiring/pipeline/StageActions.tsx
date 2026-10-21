// Stage actions for one candidate — the only place a stage is moved.
//
// Writes `stage_key` and whatever the operator typed; the DB trigger derives
// pipeline_stage, status and the stamped stage dates from it, so the legacy
// board and the CEO tiles stay coherent without this component knowing about
// them (AUDIT_TA_PORTAL.md §6.3).

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LEFT_REASONS,
  nextStages,
  stageLabel,
  stageMeta,
  stageToneClasses,
  type StageKey,
} from "@/lib/hiringPipeline";
import {
  useMoveCandidateStage,
  useRemoveFromPipeline,
  useDeleteCandidate,
  useScheduleFinalInterview,
  type PipelineCandidateRow,
} from "@/hooks/useHiringPipeline";
import {
  useFinalInterviewSchema,
  useOfferHandoffs,
  useSetOfferHandoff,
} from "@/hooks/useFinalInterview";
import { useBookingEvent, bookCandidateSlot, FINAL_INTERVIEW_EVENT_SLUG } from "@/hooks/useBookingEvent";
import { BookingSlotPicker, utcToLondonParts } from "@/components/bookings/BookingSlotPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { useEndTrialAccess } from "@/hooks/useTrialDay";

// Stages that need a date the operator supplies (a future booking), versus
// stages the trigger can honestly stamp with today.
const NEEDS_DATE: Partial<Record<StageKey, { label: string; withTime?: boolean }>> = {
  final_interview: { label: "Date of the final interview", withTime: true },
  trial_day: { label: "Date of the trial day" },
};

const NEEDS_REASON: StageKey[] = ["not_suitable", "bypass", "lct_failed", "left"];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface StageActionsProps {
  candidate: PipelineCandidateRow;
  /** True on the CEO mount: shows the "Pass on" action at Final Interview. */
  ceoView?: boolean;
  onDone?: () => void;
}

export function StageActions({ candidate, ceoView = false, onDone }: StageActionsProps) {
  const move = useMoveCandidateStage();
  const schema = useFinalInterviewSchema();
  const { data: handoffs } = useOfferHandoffs();
  const setHandoff = useSetOfferHandoff();
  const schedule = useScheduleFinalInterview();
  const removeFromPipeline = useRemoveFromPipeline();
  const [removeOpen, setRemoveOpen] = useState(false);
  const deleteCandidate = useDeleteCandidate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 'Left' carries a picked reason ahead of the typed note.
  const [leftReason, setLeftReason] = useState<(typeof LEFT_REASONS)[number] | "">("");
  // Inline scheduling for a glowing "Send to TA" card (Run 3).
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  // Live slots on Marcus's calendar (Vexon OS Bookings); manual stays as fallback.
  const [schedSlot, setSchedSlot] = useState<string | null>(null);
  const [schedManual, setSchedManual] = useState(false);
  const [fiSlot, setFiSlot] = useState<string | null>(null);
  const [fiManual, setFiManual] = useState(false);
  const { data: fiEvent } = useBookingEvent(FINAL_INTERVIEW_EVENT_SLUG);
  const [pending, setPending] = useState<StageKey | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Final-interview booking, captured on the move to LCT Passed (Run 2).
  const [fiDate, setFiDate] = useState("");
  const [fiTime, setFiTime] = useState("");
  const [reason, setReason] = useState("");
  const [wage, setWage] = useState("");
  const [startDate, setStartDate] = useState("");
  // Leaving Trial Day with a trialist login still live: Elena is asked
  // whether to end it now (15 Sep ruling — prompted, never silent).
  const endTrial = useEndTrialAccess();
  const [endTrialNow, setEndTrialNow] = useState(true);
  const leavingTrial =
    candidate.stage_key === "trial_day" && !!candidate.trialist_user_id && pending !== null && pending !== "trial_day";

  const options = nextStages(candidate.stage_key);
  const handedOff = handoffs?.has(candidate.id) ?? false;

  const open = (stage: StageKey) => {
    setPending(stage);
    setDate(NEEDS_DATE[stage] ? "" : todayIso());
    setTime("");
    setFiDate(candidate.sdr_interview_date ?? "");
    setFiTime(candidate.final_interview_time?.slice(0, 5) ?? "");
    setFiSlot(null);
    setFiManual(false);
    setReason("");
    setLeftReason("");
    setWage(candidate.offer_wage != null ? String(candidate.offer_wage) : "");
    setStartDate(candidate.offer_start_date ?? "");
    // Passing the trial (→ Offer) keeps the login: it becomes their onboarding
    // login. Anything else defaults to closing the door.
    setEndTrialNow(stage !== "offer");
  };

  const close = () => setPending(null);

  const confirm = async (sendToTa = false) => {
    if (!pending) return;
    try {
      await move.mutateAsync({
        candidateId: candidate.id,
        toStage: pending,
        // Only future bookings carry a typed date; for everything else the
        // DB trigger stamps today itself (Run 3 ruling: stop asking).
        date: NEEDS_DATE[pending] ? date || null : null,
        time: NEEDS_DATE[pending] ? time || null : null,
        exitReason: NEEDS_REASON.includes(pending)
          ? pending === "left"
            ? [leftReason, reason.trim()].filter(Boolean).join(" — ") || null
            : reason || null
          : undefined,
        offerWage: pending === "offer" ? (wage === "" ? null : Number(wage)) : undefined,
        offerStartDate: pending === "offer" ? startDate || null : undefined,
        finalInterviewDate: pending === "final_interview" && !sendToTa ? fiDate || null : undefined,
        finalInterviewTime: pending === "final_interview" && !sendToTa ? fiTime || null : undefined,
        notifyTaToSchedule: pending === "final_interview" && sendToTa ? true : undefined,
        candidateName: `${candidate.first_name} ${candidate.last_name}`.trim(),
        // Entering Final Interview with this null fires the CV chase alert.
        cvFile: candidate.cv_file,
      });
      // The hand-off is served the moment the offer details are recorded.
      if (pending === "offer" && handedOff && schema.handoffReady) {
        setHandoff.mutate({ candidateId: candidate.id, handedOff: false });
      }
      toast.success(`Moved to ${stageLabel(pending)}`);
      if (leavingTrial && endTrialNow) {
        try {
          await endTrial.mutateAsync(candidate.id);
          toast.success("Trial access ended — they can no longer sign in.");
        } catch (err) {
          toast.error(`Moved, but trial access is still open: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
      // Live slot picked → book Marcus's calendar and invite the candidate.
      // The stage move is already committed; a booking hiccup loses nothing.
      if (pending === "final_interview" && !sendToTa && fiSlot && fiEvent && !fiManual) {
        void bookCandidateSlot({
          eventTypeId: fiEvent.eventTypeId,
          hostUserId: fiEvent.hostUserId,
          startsAt: fiSlot,
          name: `${candidate.first_name} ${candidate.last_name}`.trim(),
          email: candidate.email,
          mobile: candidate.mobile_phone,
          inviteDetails: [
            { label: 'Candidate', value: `${candidate.first_name} ${candidate.last_name}`.trim() },
            { label: 'Mobile', value: candidate.mobile_phone },
            { label: 'Email', value: candidate.email },
            { label: 'LinkedIn', value: (candidate as any).linkedin_url },
          ],
        }).then((booked) => {
          if (booked.ok) {
            toast.success("Final interview booked on Marcus's calendar — invite sent");
            if (candidate.mobile_phone && booked.smsSent === false) {
              toast.warning("The confirmation SMS didn't send — the number may be invalid.");
            }
          } else toast.error(`Interview date saved, but the calendar booking failed: ${booked.error}`);
        });
      }
      close();
      onDone?.();
    } catch (err) {
      toast.error(
        `Couldn't move this candidate: ${err instanceof Error ? err.message : "unknown error"}. Has the pipeline migration (M4) been run?`,
      );
    }
  };

  // Offer stage's happy path (Run 4): "Offer accepted" moves straight to
  // Onboarding, no dialog — there is nothing left to type. PandaDoc
  // signature tracking will eventually flip this automatically; the seam is
  // in the offer dialog.
  const offerAccepted = async () => {
    try {
      await move.mutateAsync({
        candidateId: candidate.id,
        toStage: "onboarding",
        candidateName: `${candidate.first_name} ${candidate.last_name}`.trim(),
      });
      toast.success(
        `Offer accepted — ${candidate.first_name} ${candidate.last_name} is now onboarding.`,
      );
      onDone?.();
    } catch (err) {
      toast.error(
        `Couldn't move this candidate: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  const passOn = async () => {
    try {
      await setHandoff.mutateAsync({ candidateId: candidate.id, handedOff: true });
      toast.success("Passed on — the TA will fill the wage and start date and send the offer.");
      onDone?.();
    } catch (err) {
      toast.error(
        `Couldn't pass this on: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {stageLabel(candidate.stage_key)} is the end of the pipeline — nothing further to do
        here.
      </p>
    );
  }

  const meta = pending ? stageMeta(pending) : null;
  const dateSpec = pending ? NEEDS_DATE[pending] : undefined;
  const confirmDisabled =
    move.isPending || (!!dateSpec && !date) || (pending === "final_interview" && !fiDate);

  const scheduleNow = async () => {
    try {
      await schedule.mutateAsync({
        candidateId: candidate.id,
        date: schedDate,
        time: schedTime || null,
      });
      toast.success("Final interview scheduled — the card moves over on that day.");
      if (schedSlot && fiEvent && !schedManual) {
        const booked = await bookCandidateSlot({
          eventTypeId: fiEvent.eventTypeId,
          hostUserId: fiEvent.hostUserId,
          startsAt: schedSlot,
          name: `${candidate.first_name} ${candidate.last_name}`.trim(),
          email: candidate.email,
          mobile: candidate.mobile_phone,
          inviteDetails: [
            { label: 'Candidate', value: `${candidate.first_name} ${candidate.last_name}`.trim() },
            { label: 'Mobile', value: candidate.mobile_phone },
            { label: 'Email', value: candidate.email },
            { label: 'LinkedIn', value: (candidate as any).linkedin_url },
          ],
        });
        if (booked.ok) {
          toast.success("Booked on Marcus's calendar — invite sent to the candidate");
          if (candidate.mobile_phone && booked.smsSent === false) {
            toast.warning("The confirmation SMS didn't send — the number may be invalid.");
          }
        } else toast.error(`Date saved, but the calendar booking failed: ${booked.error}`);
      }
    } catch (err) {
      toast.error(
        `Couldn't schedule: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  const doRemove = async () => {
    try {
      await removeFromPipeline.mutateAsync({
        candidateId: candidate.id,
        cvScreeningId: candidate.cv_screening_id,
      });
      toast.success(
        `${candidate.first_name} ${candidate.last_name} removed from the pipeline — back in the Call List with no status.`,
      );
      setRemoveOpen(false);
      onDone?.();
    } catch (err) {
      toast.error(
        `Couldn't remove: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  return (
    <div className="space-y-2">
      {/* "Send to TA" landed here: the glowing card's other half — book the
          final interview without moving stage; the day-of auto-move does
          the rest. */}
      {candidate.stage_key === "trial_day" && !candidate.sdr_interview_date && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">
            Final interview needs a date
          </p>
          <p className="text-xs text-muted-foreground">
            The CEO passed the trial and asked for the final interview to be
            booked. The card moves to Final Interview by itself on the day you
            set.
          </p>
          {fiEvent && !schedManual ? (
            <div className="space-y-2">
              <BookingSlotPicker
                eventTypeId={fiEvent.eventTypeId}
                hostUserId={fiEvent.hostUserId}
                value={schedSlot}
                onSelect={(startsAt) => {
                  setSchedSlot(startsAt);
                  if (startsAt) {
                    const { date, time } = utcToLondonParts(startsAt);
                    setSchedDate(date);
                    setSchedTime(time);
                  } else {
                    setSchedDate("");
                    setSchedTime("");
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline hover:text-primary"
                  onClick={() => { setSchedManual(true); setSchedSlot(null); setSchedDate(""); setSchedTime(""); }}
                >
                  Enter date/time manually
                </button>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!schedDate || schedule.isPending}
                  onClick={scheduleNow}
                >
                  {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Schedule &amp; book Marcus
                </Button>
              </div>
            </div>
          ) : (
          <div className="space-y-1.5">
            {fiEvent && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-primary"
                onClick={() => { setSchedManual(false); setSchedSlot(null); setSchedDate(""); setSchedTime(""); }}
              >
                Use Marcus's live availability
              </button>
            )}
          <div className="flex gap-2">
            <Input
              type="date"
              className="h-8 flex-1 bg-background text-sm"
              value={schedDate}
              onChange={(e) => setSchedDate(e.target.value)}
            />
            <Input
              type="time"
              className="h-8 w-28 bg-background text-sm"
              value={schedTime}
              onChange={(e) => setSchedTime(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={!schedDate || schedule.isPending}
              onClick={scheduleNow}
            >
              {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </div>
          </div>
          )}
        </div>
      )}

      {/* CEO clicked Pass on: whoever opens this next (the TA) sees why the
          card is flagged and what to do. */}
      {handedOff && candidate.stage_key === "final_interview" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">Passed on by the CEO</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fill in the wage and start date and send the offer — use the Offer
            button below.
          </p>
        </div>
      )}

      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Move this candidate
      </h4>
      <div className="flex flex-wrap gap-2">
        {options.map((stage) => {
          const m = stageMeta(stage);
          const destructive = m?.tone === "bad";
          // At Offer, the forward move reads as the event it records.
          const acceptShortcut = candidate.stage_key === "offer" && stage === "onboarding";
          return (
            <Button
              key={stage}
              size="sm"
              variant={destructive ? "outline" : "default"}
              className={destructive ? "text-destructive hover:text-destructive" : ""}
              disabled={acceptShortcut && move.isPending}
              onClick={() => (acceptShortcut ? offerAccepted() : open(stage))}
            >
              {acceptShortcut ? "Offer accepted" : stageLabel(stage)}
            </Button>
          );
        })}
        {/* Offer's counterpart on the CEO mount: hand the paperwork to the
            TA instead of filling it here. Not a stage move — the candidate
            stays at Final Interview so no offer date is stamped early. */}
        {ceoView &&
          candidate.stage_key === "final_interview" &&
          schema.handoffReady &&
          !handedOff && (
            <Button size="sm" variant="outline" disabled={setHandoff.isPending} onClick={passOn}>
              {setHandoff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pass on
            </Button>
          )}
      </div>

      {/* The escape hatch (Run 3): wrong booking, candidate withdrew before
          sitting anything — take them off the board entirely. They reappear
          in the Call List with no status; nothing is deleted. */}
      {candidate.stage_key && candidate.stage_key !== "screening" && (
        <button
          type="button"
          onClick={() => setRemoveOpen(true)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline"
        >
          Remove from pipeline
        </button>
      )}

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Remove {candidate.first_name} {candidate.last_name} from the pipeline
            </DialogTitle>
            <DialogDescription>
              This takes them off the board and puts them back in the Call
              List with no status — the booking dates are cleared so they can
              be booked again fresh. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeFromPipeline.isPending}
              onClick={doRemove}
            >
              {removeFromPipeline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 11 Sep (the owner): test and duplicate records must be purgeable. A person
          who has actually left goes to the Left lane instead. */}
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline"
      >
        <Trash2 className="h-3 w-3" /> Delete this record
      </button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {candidate.first_name} {candidate.last_name} everywhere?
            </DialogTitle>
            <DialogDescription>
              For test entries and duplicates only. This removes the candidate, their call-list entry and phone screen,
              their interviews and any onboarding profile that never got a login. It cannot be undone. Someone who
              was hired and then left belongs in the Left lane, not here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCandidate.isPending}
              onClick={async () => {
                try {
                  await deleteCandidate.mutateAsync({ candidateId: candidate.id, cvScreeningId: candidate.cv_screening_id ?? null });
                  toast.success("Record deleted");
                  setDeleteOpen(false);
                  onDone?.();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete");
                }
              }}
            >
              {deleteCandidate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {stageLabel(pending)} — {candidate.first_name} {candidate.last_name}
            </DialogTitle>
            <DialogDescription>
              {dateSpec
                ? "Record the date and time for this stage."
                : meta?.tone === "bad"
                ? "This takes the candidate out of the active pipeline. A short reason helps whoever reads this later."
                : "Today's date is recorded automatically."}
            </DialogDescription>
          </DialogHeader>

          {/* min-w-0 is load-bearing here (direct grid child of DialogContent):
              without it the slot picker's day strip sets the grid track width
              and the picker overflows the dialog. */}
          <div className="space-y-4 min-w-0">
            {/* Only genuinely-future bookings ask for a date; every other
                stage stamps today by itself (the M4 trigger). */}
            {dateSpec && (
            <div className="space-y-2">
              <Label htmlFor="stage-date">{dateSpec.label} *</Label>
              <div className="flex gap-2">
                <Input
                  id="stage-date"
                  type="date"
                  className="flex-1"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {dateSpec.withTime && (
                  <Input
                    type="time"
                    className="w-32"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                )}
              </div>
            </div>
            )}

            {/* Passing the trial books the final interview in the same
                breath (Run 2) — or hands the scheduling to the TA (Run 3),
                whose card glows until she books it. */}
            {pending === "final_interview" && (
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fi-date-sa">Final interview date &amp; time</Label>
                  {fiEvent && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-primary"
                      onClick={() => { setFiManual((m) => !m); setFiSlot(null); setFiDate(""); setFiTime(""); }}
                    >
                      {fiManual ? "Use Marcus's live availability" : "Enter manually"}
                    </button>
                  )}
                </div>
                {fiEvent && !fiManual ? (
                  <BookingSlotPicker
                    eventTypeId={fiEvent.eventTypeId}
                    hostUserId={fiEvent.hostUserId}
                    value={fiSlot}
                    onSelect={(startsAt) => {
                      setFiSlot(startsAt);
                      if (startsAt) {
                        const { date, time } = utcToLondonParts(startsAt);
                        setFiDate(date);
                        setFiTime(time);
                      } else {
                        setFiDate("");
                        setFiTime("");
                      }
                    }}
                  />
                ) : (
                <div className="flex gap-2">
                  <Input
                    id="fi-date-sa"
                    type="date"
                    className="flex-1"
                    value={fiDate}
                    onChange={(e) => setFiDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    className="w-32"
                    value={fiTime}
                    onChange={(e) => setFiTime(e.target.value)}
                  />
                </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {ceoView ? (
                    <>
                      Schedule it here (the card moves itself to Final
                      Interview on that day), or use <strong>Send to TA</strong>{" "}
                      and the TA books it — their card glows until they do.
                    </>
                  ) : (
                    "Schedule it here — the card moves itself to Final Interview on that day."
                  )}
                </p>
              </div>
            )}

            {pending === "offer" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="offer-wage">Wage</Label>
                  <Input
                    id="offer-wage"
                    type="number"
                    min="0"
                    step="0.01"
                    value={wage}
                    onChange={(e) => setWage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-start">Start date</Label>
                  <Input
                    id="offer-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                {/* PANDADOC INTEGRATION POINT — the offer stage is where a
                    contract would be generated and sent for signature, and
                    where its status would be tracked back. No PandaDoc code
                    now, by instruction; the seam is here, next to the offer
                    terms, and the existing send-pandadoc-agreement edge
                    function is the thing to call. See the plan doc. */}
                <p className="col-span-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  Contract sending and signature tracking will attach here.
                </p>
              </div>
            )}

            {pending === "left" && (
              <div className="space-y-2">
                <Label>Why they left</Label>
                <div className="flex flex-wrap gap-2">
                  {LEFT_REASONS.map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={leftReason === r ? "default" : "outline"}
                      onClick={() => setLeftReason(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  They stay in the Left lane under Closed with this reason. If they have a Vexon OS login, offboard them from HR → Employee Hub as well.
                </p>
              </div>
            )}

            {leavingTrial && (
              <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <Checkbox
                  checked={endTrialNow}
                  onCheckedChange={(v) => setEndTrialNow(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-foreground">End their trialist login now</span>
                  <span className="block text-xs text-muted-foreground">
                    {pending === "offer"
                      ? "Leave this off if they passed: the same login carries into onboarding when you start it."
                      : "They lose access to the trial portal immediately. Their logged leads stay with Daniel."}
                  </span>
                </span>
              </label>
            )}

            {pending && NEEDS_REASON.includes(pending) && (
              <div className="space-y-2">
                <Label htmlFor="stage-reason">{pending === "left" ? "Note (optional)" : "Reason"}</Label>
                <Textarea
                  id="stage-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Short note — what decided it"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:space-x-0">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            {/* Hand-off is the CEO's move only — on the TA's own mount the
                glowing card IS the to-do, so offering "Send to TA" to the TA
                would be a loop (Run 4 ruling). */}
            {pending === "final_interview" && ceoView && (
              <Button variant="outline" disabled={move.isPending} onClick={() => confirm(true)}>
                Send to TA to schedule
              </Button>
            )}
            <Button disabled={confirmDisabled} onClick={() => confirm(false)}>
              {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending === "final_interview" ? "Confirm & schedule" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small stage pill, shared by every pipeline list. */
export function StagePill({ stageKey }: { stageKey: string | null }) {
  const meta = stageMeta(stageKey);
  const tone = stageToneClasses[meta?.tone ?? "neutral"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.pill}`}>
      {stageLabel(stageKey)}
    </span>
  );
}
