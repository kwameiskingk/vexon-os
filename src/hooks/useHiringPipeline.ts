// The hiring pipeline, read once and derived client-side (house full-roster
// norm — see useCvScreenings).
//
// Canonical stage is `candidates.stage_key`; `pipeline_stage` and the stage
// dates are derived from it by a DB trigger (migration M4) and must never be
// written from here. Every write below sets stage_key and the user-supplied
// date/time only.
//
// Tolerates M4 being unapplied: the select is guarded and falls back to the
// legacy columns, so the surface renders (without stage_key) rather than
// crashing.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError, withMigrationGuard, type GuardedResult } from "@/lib/migrationGuard";
import { stageLabel, type StageKey } from "@/lib/hiringPipeline";
import { CV_SCREENINGS_QUERY_KEY } from "./useCvScreenings";

export interface PipelineCandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string | null;
  linkedin_url: string | null;
  status: string | null;
  notes: string | null;
  date_of_call: string | null;
  call_time: string | null;
  /** Storage path in the private candidate-cvs bucket (pre-M4 column). */
  cv_file: string | null;
  // Canonical (M4)
  stage_key: string | null;
  lct_booked_time: string | null;
  final_interview_time: string | null;
  stage_changed_at: string | null;
  exit_reason: string | null;
  cv_screening_id: string | null;
  // Legacy / derived — read for display, never written directly
  pipeline_stage: number | null;
  lct_booked_date: string | null;
  ceo_trial_call_date: string | null;
  sdr_interview_date: string | null;
  offer_letter_date: string | null;
  offer_wage: number | null;
  offer_start_date: string | null;
  accepted_date: string | null;
  feedback_from_ceo: string | null;
  feedback_from_ops_lead: string | null;
  // Trial Day (15 Sep): the day itself and the trialist login it was run on.
  trial_day_date?: string | null;
  trialist_user_id?: string | null;
  /** Clients the trialist dials for, alias order (Client A = index 0). */
  trial_client_ids?: string[] | null;
}

export const HIRING_PIPELINE_QUERY_KEY = ["hiring-pipeline"] as const;

const PIPELINE_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "mobile_phone",
  "linkedin_url",
  "status",
  "notes",
  "date_of_call",
  "call_time",
  // Predates M4 (created 20251111085447), so it also rides the legacy
  // fallback select rather than the M4-only set.
  "cv_file",
  "stage_key",
  "lct_booked_time",
  "final_interview_time",
  "stage_changed_at",
  "exit_reason",
  "cv_screening_id",
  "pipeline_stage",
  "lct_booked_date",
  "ceo_trial_call_date",
  "sdr_interview_date",
  "offer_letter_date",
  "offer_wage",
  "offer_start_date",
  "accepted_date",
  "feedback_from_ceo",
  "feedback_from_ops_lead",
  "trial_day_date",
  "trialist_user_id",
  "trial_client_ids",
].join(", ");

// Columns that exist before M4 — the fallback select.
const LEGACY_COLUMNS = PIPELINE_COLUMNS.split(", ")
  .filter(
    (c) =>
      ![
        "stage_key",
        "lct_booked_time",
        "final_interview_time",
        "stage_changed_at",
        "exit_reason",
        "cv_screening_id",
        "trial_day_date",
        "trialist_user_id",
        "trial_client_ids",
      ].includes(c),
  )
  .join(", ");

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Best-effort bell notification to the recruiting operator — never blocks the
 * caller. 2 Sep: the TA portal is retired and Elena (role `ops`) runs
 * recruiting from Ops Command under her own login, so these bells address the
 * ops role and land on Ops Command → Talent Acquisition → Candidate Tracking
 * (3 Sep: tracking moved there from under Hiring). (The notifications SELECT
 * policy matches on has_role(recipient_role); addressing a role that no user
 * holds makes the bell invisible forever — the failure mode this fixes.)
 */
async function notifyRecruiter(title: string, message: string): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      category: "system",
      recipient_id: null,
      recipient_role: "ops",
      title,
      message,
      link_url: "/ops-command/talent-acquisition?tab=tracking",
    } as never);
  } catch {
    // Opportunistic by design.
  }
}


/**
 * One-time chase alert (Marcus's spec): a candidate ENTERING Final Interview
 * with no CV on file drops a single bell notification for the recruiter.
 * Dedupe is a cheap pre-check for an existing unread notification for this
 * candidate — the candidate id rides in link_url so the check is exact, and
 * the link lands on the Candidate Tracking tab (the cv-chase query string is
 * ignored there).
 * Best-effort like notifyRecruiter: never blocks the stage move.
 */
async function notifyCvChase(candidateId: string, candidateName: string): Promise<void> {
  try {
    // Dedupe + insert happen atomically inside a SECURITY DEFINER function
    // (migration 20260821100000, re-pointed to the ops role by migration
    // 20260902120000): a client-side check can't dedupe because notifications
    // RLS hides other roles' rows from the mover, and the function also
    // removes the need to broaden the notifications INSERT policy. The RPC
    // name keeps its historical "ta" prefix so old and new frontends work
    // against either function version during the deploy window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("notify_ta_cv_missing", {
      p_candidate_id: candidateId,
      p_candidate_name: candidateName,
    });
  } catch {
    // Opportunistic by design.
  }
}

/**
 * Day-of auto-move (Run 2 ruling): a candidate sat at LCT Passed with a
 * scheduled final-interview date moves to Final Interview by itself on that
 * day. Runs as a sweep whenever any pipeline surface loads — idempotent (the
 * update is keyed on stage_key='lct_passed', so a concurrent sweep is a
 * no-op) and best-effort (a viewer without write rights just doesn't sweep;
 * the next CEO/ops load does). Each move drops a bell notification for the
 * recruiter.
 */
async function autoMoveDueFinalInterviews(rows: PipelineCandidateRow[]): Promise<void> {
  const today = todayIsoDate();
  // From 22 Sep the stage before Final Interview is Trial Day.
  const due = rows.filter(
    (r) => r.stage_key === "trial_day" && r.sdr_interview_date && r.sdr_interview_date <= today,
  );
  for (const r of due) {
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ stage_key: "final_interview" } as never)
        .eq("id", r.id)
        .eq("stage_key", "trial_day");
      if (error) continue;
      r.stage_key = "final_interview";
      // Tell the recruiter it moved on its own.
      await notifyRecruiter(
        "Moved to Final Interview",
        `${r.first_name} ${r.last_name} moved to Final Interview automatically — the interview is scheduled for today (${r.sdr_interview_date}).`,
      );
      // Entering Final Interview without a CV → one-time chase alert.
      if (!r.cv_file) {
        await notifyCvChase(r.id, `${r.first_name} ${r.last_name}`.trim() || "A candidate");
      }
    } catch {
      // Swallow: sweep is opportunistic by design.
    }
  }
}

export function useHiringPipeline() {
  return useQuery({
    queryKey: HIRING_PIPELINE_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<GuardedResult<PipelineCandidateRow[]>> => {
      const guardedResult = await withMigrationGuard<PipelineCandidateRow[]>(
        () =>
          supabase
            .from("candidates")
            .select(PIPELINE_COLUMNS as "id")
            .order("date_of_call", { ascending: false, nullsFirst: false }) as never,
        [],
      );
      if (!guardedResult.migrationPending) {
        await autoMoveDueFinalInterviews(guardedResult.data);
        return guardedResult;
      }

      // M4 not applied yet — fall back so the page still renders.
      const { data, error } = await supabase
        .from("candidates")
        .select(LEGACY_COLUMNS as "id")
        .order("date_of_call", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return {
        data: ((data ?? []) as unknown as PipelineCandidateRow[]).map((r) => ({
          ...r,
          stage_key: null,
          lct_booked_time: null,
          final_interview_time: null,
          stage_changed_at: null,
          exit_reason: null,
          cv_screening_id: null,
        })),
        migrationPending: true,
      };
    },
  });
}

export interface StageMoveInput {
  candidateId: string;
  toStage: StageKey;
  /** User-supplied date for stages that schedule something. */
  date?: string | null;
  time?: string | null;
  exitReason?: string | null;
  offerWage?: number | null;
  offerStartDate?: string | null;
  /**
   * Captured on the move TO lct_passed (Run 2 ruling): passing the trial
   * means the final interview gets scheduled there and then. The card then
   * auto-moves to Final Interview on that day (autoMoveDueFinalInterviews).
   * Run 3: the date may be omitted when the CEO chooses "Send to TA" — the
   * card then glows on the TA side until she schedules it.
   */
  finalInterviewDate?: string | null;
  finalInterviewTime?: string | null;
  /** "Send to TA": drop a bell notification asking the TA to schedule. */
  notifyTaToSchedule?: boolean;
  /** Name for the notification message. */
  candidateName?: string;
  /**
   * candidates.cv_file, when the caller already holds the row — moving TO
   * final_interview without a CV drops the one-time chase alert. Omitted,
   * the mutation looks it up itself.
   */
  cvFile?: string | null;
}

/**
 * Move a candidate to a stage. Writes stage_key plus whatever the operator
 * typed; the DB trigger derives pipeline_stage, status, and the stamped stage
 * dates from stage_key.
 */
export function useMoveCandidateStage() {
  const queryClient = useQueryClient();
  const { userRoles } = useAuth();
  // The recruiter (Elena, role ops) hears about moves she didn't make; her
  // own moves stay silent — she was there. Was the TA role pre-2 Sep.
  const moverIsRecruiter = userRoles.includes("ops");
  return useMutation({
    mutationFn: async (input: StageMoveInput) => {
      const payload: Record<string, unknown> = { stage_key: input.toStage };

      if (input.toStage === "booked") {
        if (input.date) payload.lct_booked_date = input.date;
        if (input.time !== undefined) payload.lct_booked_time = input.time || null;
      }
      if (input.toStage === "final_interview") {
        if (input.date) payload.sdr_interview_date = input.date;
        if (input.time !== undefined) payload.final_interview_time = input.time || null;
      }
      if (input.toStage === "lct_failed") {
        if (input.date) payload.ceo_trial_call_date = input.date;
      }
      // 22 Sep 2026: the final interview is scheduled on the way INTO Final
      // Interview, which now follows the Trial Day. `date` already covers it,
      // but the dedicated fields are kept so the Trial Day card can schedule
      // ahead without leaving its column.
      if (input.toStage === "final_interview") {
        if (input.finalInterviewDate) payload.sdr_interview_date = input.finalInterviewDate;
        if (input.finalInterviewTime !== undefined)
          payload.final_interview_time = input.finalInterviewTime || null;
      }
      if (input.toStage === "trial_day" && input.date) payload.trial_day_date = input.date;
      if (input.toStage === "offer") {
        if (input.date) payload.offer_letter_date = input.date;
        if (input.offerWage !== undefined) payload.offer_wage = input.offerWage;
        if (input.offerStartDate !== undefined) payload.offer_start_date = input.offerStartDate || null;
      }
      if (input.toStage === "hired" && input.date) payload.accepted_date = input.date;
      // The trigger maps 'left' → status 'left' once migration 20260911160000
      // has run; setting it here too keeps a pre-migration database honest.
      if (input.toStage === "left") payload.status = "left";
      if (input.exitReason !== undefined) payload.exit_reason = input.exitReason || null;

      const { error } = await supabase
        .from("candidates")
        .update(payload as never)
        .eq("id", input.candidateId);
      if (error) throw error;

      // Entering Final Interview without a CV → one-time chase alert for
      // the recruiter (dedupe lives in notifyCvChase). The sweep path has
      // its own copy of this check.
      if (input.toStage === "final_interview") {
        let cvFile = input.cvFile;
        if (cvFile === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from("candidates")
            .select("cv_file")
            .eq("id", input.candidateId)
            .maybeSingle();
          cvFile = (data as { cv_file: string | null } | null)?.cv_file ?? null;
        }
        if (!cvFile) {
          await notifyCvChase(input.candidateId, input.candidateName ?? "A candidate");
        }
      }

      if (input.toStage === "final_interview" && input.notifyTaToSchedule) {
        await notifyRecruiter(
          "Schedule the final interview",
          `${input.candidateName ?? "A candidate"} passed the live call trial — the CEO has asked you to book the final interview date and time.`,
        );
      } else if (!moverIsRecruiter) {
        // Run 5 ruling (recipient re-pointed 2 Sep): the recruiter hears
        // about every stage move she didn't make herself (the CEO dragging
        // cards, admin actions). Her own moves stay silent — she was there.
        await notifyRecruiter(
          "Pipeline update",
          `${input.candidateName ?? "A candidate"} moved to ${stageLabel(input.toStage)}.`,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
    },
  });
}

/**
 * Schedule (or reschedule) the final interview without moving stage — the
 * TA's half of the CEO's "Send to TA" hand-off. The card keeps sitting in
 * LCT Passed and auto-moves on the chosen day.
 */
export function useScheduleFinalInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; date: string; time?: string | null }) => {
      const { error } = await supabase
        .from("candidates")
        .update({
          sdr_interview_date: input.date,
          final_interview_time: input.time || null,
        } as never)
        .eq("id", input.candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
    },
  });
}

/**
 * Take a candidate off the pipeline entirely (Run 3): back to stage_key
 * 'screening' with the booking wiped and the linked screening's review
 * status cleared, so they reappear in the Call List with no status. Dates
 * already stamped by held trials (ceo_trial_call_date etc.) are left alone —
 * they are history the CEO tiles already counted.
 */
export function useRemoveFromPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; cvScreeningId: string | null }) => {
      const base = {
        stage_key: "screening",
        lct_booked_date: null,
        lct_booked_time: null,
        sdr_interview_date: null,
        final_interview_time: null,
        exit_reason: null,
      };
      // Clear the offer hand-off too when its column exists; retry without
      // it on a pre-migration database.
      const { error } = await supabase
        .from("candidates")
        .update({ ...base, offer_handoff_at: null } as never)
        .eq("id", input.candidateId);
      if (error) {
        if (!isMissingSchemaError(error)) throw error;
        const { error: retryError } = await supabase
          .from("candidates")
          .update(base as never)
          .eq("id", input.candidateId);
        if (retryError) throw retryError;
      }

      if (input.cvScreeningId) {
        const { error: screeningError } = await supabase
          .from("cv_screenings")
          .update({ review_status: null } as never)
          .eq("id", input.cvScreeningId);
        if (screeningError) throw screeningError;
      }

      // An onboarding profile created for this candidate goes too (Run 3
      // fix: it used to linger in Onboarding progress after removal) —
      // but ONLY while no login is attached. A provisioned starter is a
      // real account and is never silently wiped from here.
      try {
        const { data: onboardingRows } = await supabase
          .from("employee_onboarding" as never)
          .select("id, user_id")
          .eq("candidate_id", input.candidateId);
        for (const row of (onboardingRows ?? []) as { id: string; user_id: string | null }[]) {
          if (row.user_id) continue;
          await supabase
            .from("employee_onboarding_tasks" as never)
            .delete()
            .eq("onboarding_id", row.id);
          await supabase.from("employee_onboarding" as never).delete().eq("id", row.id);
        }
      } catch {
        // Pre-M6 database or RLS says no — removal itself still succeeded.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["offer-handoffs"] });
      queryClient.invalidateQueries({ queryKey: ["employee-onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["employee-onboarding-tasks"] });
    },
  });
}

/**
 * Purge a candidate everywhere (11 Sep, the owner: test entries such as
 * "Taylor Tim" must go completely). Deletes the linked screening row (its
 * phone screen cascades), any onboarding profile that never got a login
 * (a provisioned starter is a real account and is left alone), then the
 * candidate itself (interviews, stage events and final-interview rows
 * cascade). Nothing is soft: this is for records that should never have
 * existed, not for people who left — those go to the Left lane.
 */
export function useDeleteCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; cvScreeningId: string | null }) => {
      try {
        const { data: onboardingRows } = await supabase
          .from("employee_onboarding" as never)
          .select("id, user_id")
          .eq("candidate_id", input.candidateId);
        for (const row of (onboardingRows ?? []) as { id: string; user_id: string | null }[]) {
          if (row.user_id) throw new Error("This person has a Vexon OS login. Offboard them from HR → Employee Hub instead of deleting the candidate.");
          await supabase.from("employee_onboarding_tasks" as never).delete().eq("onboarding_id", row.id);
          await supabase.from("employee_onboarding" as never).delete().eq("id", row.id);
        }
      } catch (e) {
        if (e instanceof Error && /Vexon OS login/.test(e.message)) throw e;
        // Pre-M6 database: nothing to clean.
      }
      if (input.cvScreeningId) {
        const { error: sErr } = await supabase.from("cv_screenings").delete().eq("id", input.cvScreeningId);
        if (sErr) throw sErr;
      }
      const { error } = await supabase.from("candidates").delete().eq("id", input.candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["employee-onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["employee-onboarding-tasks"] });
    },
  });
}

export interface StageEvent {
  id: string;
  candidate_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

export function useCandidateStageEvents(candidateId: string | null) {
  return useQuery({
    queryKey: ["candidate-stage-events", candidateId ?? "none"],
    enabled: !!candidateId,
    queryFn: async (): Promise<GuardedResult<StageEvent[]>> =>
      withMigrationGuard<StageEvent[]>(
        () =>
          supabase
            .from("candidate_stage_events" as never)
            .select("*")
            .eq("candidate_id", candidateId!)
            .order("changed_at", { ascending: false }) as never,
        [],
      ),
  });
}
