// Onboarding profiles + their typed step checklists.
//
// employee_onboarding / employee_onboarding_tasks are the M6-era tables;
// M7 (docs/pending-migrations/2026-08-17-onboarding-steps.sql) adds the
// typed-step columns and the release_onboarding() function. Everything here
// tolerates M7 being unapplied: seeding falls back to the legacy column
// shape, answers degrade to completion-without-answer, and release fails
// with a clear message naming the script — never a crash.
//
// 3 Sep: start_date (employee_onboarding) and description (tasks) arrive
// with supabase/migrations/20260903160000_sdr_deck_hr_checklist.sql. Both
// are probed the same way: try with, retry without.
//
// The step template itself lives in src/lib/onboardingSteps.ts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isMissingSchemaError,
  withMigrationGuard,
  type GuardedResult,
} from "@/lib/migrationGuard";
import { onboardingTemplate } from "@/lib/onboardingSteps";
import { fetchOnboardingFlow } from "@/hooks/useOnboardingFlow";

export interface OnboardingRecord {
  id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  company_email: string | null;
  target_role: string | null;
  target_department: string | null;
  stage: string | null;
  onboarding_state: string | null;
  user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  /** Planned first day (date, no time). Null until Elena sets it or pre-migration. */
  start_date?: string | null;
  /** 11 Sep: when HR released the day-one cards. Null until then or pre-migration. */
  day_one_released_at?: string | null;
}

export interface OnboardingTask {
  id: string;
  onboarding_id: string;
  stage: string;
  task_key: string;
  task_label: string;
  is_completed: boolean | null;
  completed_at: string | null;
  completed_by: string | null;
  // M7+ columns — undefined/null until their migrations are run.
  sort_order?: number | null;
  step_type?: string | null;
  link_url?: string | null;
  video_url?: string | null;
  document_path?: string | null;
  proof_path?: string | null;
  question_prompt?: string | null;
  answer_text?: string | null;
  description?: string | null;
}

export const ONBOARDING_QUERY_KEY = ["employee-onboarding"] as const;
export const ONBOARDING_TASKS_QUERY_KEY = ["employee-onboarding-tasks"] as const;

const FULL_COLUMNS =
  "id, candidate_id, candidate_name, candidate_email, company_email, target_role, target_department, stage, onboarding_state, user_id, started_at, ended_at, created_at";
const FULL_COLUMNS_WITH_START = `${FULL_COLUMNS}, start_date`;
const FULL_COLUMNS_WITH_RELEASE = `${FULL_COLUMNS_WITH_START}, day_one_released_at`;
const LEGACY_COLUMNS =
  "id, candidate_id, candidate_name, candidate_email, target_role, target_department, stage, user_id, created_at";

export interface OnboardingRecordsResult extends GuardedResult<OnboardingRecord[]> {
  /** 3 Sep migration applied — start_date can be read and written. */
  startDateReady: boolean;
  /** 11 Sep migration applied — day one can be released by hand. */
  dayOneReleaseReady: boolean;
}

export function useOnboardingRecords() {
  return useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<OnboardingRecordsResult> => {
      const withRelease = await withMigrationGuard<OnboardingRecord[]>(
        () =>
          supabase
            .from("employee_onboarding")
            .select(FULL_COLUMNS_WITH_RELEASE as "id")
            .order("created_at", { ascending: false }) as never,
        [],
      );
      if (!withRelease.migrationPending) return { ...withRelease, startDateReady: true, dayOneReleaseReady: true };

      const withStart = await withMigrationGuard<OnboardingRecord[]>(
        () =>
          supabase
            .from("employee_onboarding")
            .select(FULL_COLUMNS_WITH_START as "id")
            .order("created_at", { ascending: false }) as never,
        [],
      );
      if (!withStart.migrationPending) return { ...withStart, startDateReady: true, dayOneReleaseReady: false };

      const result = await withMigrationGuard<OnboardingRecord[]>(
        () =>
          supabase
            .from("employee_onboarding")
            .select(FULL_COLUMNS as "id")
            .order("created_at", { ascending: false }) as never,
        [],
      );
      if (!result.migrationPending) return { ...result, startDateReady: false, dayOneReleaseReady: false };

      const { data, error } = await supabase
        .from("employee_onboarding")
        .select(LEGACY_COLUMNS as "id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return {
        data: ((data ?? []) as unknown as OnboardingRecord[]).map((r) => ({
          ...r,
          company_email: null,
          onboarding_state: null,
          started_at: null,
          ended_at: null,
        })),
        migrationPending: true,
        startDateReady: false,
        dayOneReleaseReady: false,
      };
    },
  });
}

/**
 * Every task for every onboarding record the caller can see (RLS scopes the
 * starter to their own). select("*") on purpose: it returns whatever columns
 * exist, so the same query works before and after M7.
 */
export function useOnboardingTasks() {
  return useQuery({
    queryKey: ONBOARDING_TASKS_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<OnboardingTask[]> => {
      const { data, error } = await supabase
        .from("employee_onboarding_tasks")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingTask[];
    },
  });
}

/** { onboarding_id: { done, total } } for coarse progress displays. */
export function taskProgress(tasks: OnboardingTask[]): Record<string, { done: number; total: number }> {
  const out: Record<string, { done: number; total: number }> = {};
  for (const t of tasks) {
    const bucket = (out[t.onboarding_id] ??= { done: 0, total: 0 });
    bucket.total += 1;
    if (t.is_completed) bucket.done += 1;
  }
  return out;
}

export interface CreateOnboardingInput {
  candidateId: string;
  fullName: string;
  personalEmail: string | null;
  companyEmail: string;
  targetRole: string;
  cvScreeningId: string | null;
  /** Planned first day, YYYY-MM-DD. Optional; needs the 3 Sep migration. */
  startDate?: string | null;
}

export interface CreateOnboardingOutcome {
  onboardingId: string;
  /** True when the task seed had to fall back to the pre-M7 column shape. */
  migrationPending: boolean;
  /** True when a start date was given but the column doesn't exist yet. */
  startDateDropped: boolean;
}

export function useCreateOnboardingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOnboardingInput): Promise<CreateOnboardingOutcome> => {
      const { data: auth } = await supabase.auth.getUser();

      // The record starts not_started: the starter hasn't begun (no login
      // exists yet — provisioning is a separate, deferred step).
      const baseRow = {
        candidate_id: input.candidateId,
        candidate_name: input.fullName,
        candidate_email: input.personalEmail,
        company_email: input.companyEmail,
        target_role: input.targetRole,
        cv_screening_id: input.cvScreeningId,
        created_by: auth?.user?.id ?? null,
        stage: "screening",
        onboarding_state: "not_started",
      };
      let startDateDropped = false;
      let inserted: { id: string } | null = null;
      if (input.startDate) {
        const { data, error } = await supabase
          .from("employee_onboarding")
          .insert({ ...baseRow, start_date: input.startDate } as never)
          .select("id")
          .single();
        if (!error) inserted = data as { id: string };
        else if (!isMissingSchemaError(error)) throw error;
        else startDateDropped = true;
      }
      if (!inserted) {
        const { data, error } = await supabase
          .from("employee_onboarding")
          .insert(baseRow as never)
          .select("id")
          .single();
        if (error) throw error;
        inserted = data as { id: string };
      }
      const onboardingId = inserted.id;

      // Seed the typed two-phase step list. The flow comes from the Dev
      // Center's builder table when it exists and has rows (Run 3); the code
      // template stays as the fallback so provisioning never breaks. If M7
      // isn't applied the typed columns don't exist — retry with the legacy
      // shape; the stepper still renders types/order from the code template
      // by task_key.
      const dbFlow = await fetchOnboardingFlow();
      const template = dbFlow ?? onboardingTemplate(input.targetRole);
      const typedRows = (withDescription: boolean) =>
        template.map((s) => ({
          onboarding_id: onboardingId,
          stage: s.phase,
          task_key: s.key,
          task_label: s.label,
          sort_order: s.order,
          step_type: s.type,
          link_url: s.linkUrl,
          question_prompt: s.questionPrompt,
          // video_url only exists once the flow-builder migration is applied —
          // which is guaranteed when the flow itself came from the DB.
          ...(dbFlow ? { video_url: s.videoUrl ?? null } : {}),
          // document_path only once the 2026-08-19 docs migration is applied
          // (undefined otherwise, so the insert never names the column).
          ...(dbFlow && s.documentPath !== undefined
            ? { document_path: s.documentPath ?? null }
            : {}),
          // description (3 Sep) is the card's speaker intro; the code
          // template carries it too, so it is seeded whenever the column exists.
          ...(withDescription ? { description: s.description ?? null } : {}),
        }));

      let migrationPending = false;
      let seedError = (await supabase.from("employee_onboarding_tasks").insert(typedRows(true) as never)).error;
      if (seedError && isMissingSchemaError(seedError)) {
        // Either description or the whole typed shape is missing. Try typed
        // without description, then legacy.
        seedError = (await supabase.from("employee_onboarding_tasks").insert(typedRows(false) as never)).error;
      }
      if (seedError) {
        if (!isMissingSchemaError(seedError)) throw seedError;
        migrationPending = true;
        const legacyRows = template.map((s) => ({
          onboarding_id: onboardingId,
          stage: s.phase,
          task_key: s.key,
          task_label: s.label,
        }));
        const { error: legacyError } = await supabase
          .from("employee_onboarding_tasks")
          .insert(legacyRows as never);
        if (legacyError) throw legacyError;
      }

      return { onboardingId, migrationPending, startDateDropped };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ONBOARDING_TASKS_QUERY_KEY });
    },
  });
}

/** Elena sets or clears a starter's planned first day (3 Sep, R6). */
export function useSetStartDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ onboardingId, startDate }: { onboardingId: string; startDate: string | null }) => {
      const { error } = await supabase
        .from("employee_onboarding")
        .update({ start_date: startDate } as never)
        .eq("id", onboardingId);
      if (error) {
        if (isMissingSchemaError(error)) {
          throw new Error("Start dates need the 3 Sep migration (20260903160000_sdr_deck_hr_checklist.sql).");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
  });
}

/**
 * 11 Sep (Marcus, 8 Sep): day one is released by hand on the morning, so a
 * no-show or a bad fit never sees the training material. Null withdraws it.
 */
export function useReleaseDayOne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ onboardingId, release }: { onboardingId: string; release: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("employee_onboarding")
        .update({
          day_one_released_at: release ? new Date().toISOString() : null,
          day_one_released_by: release ? user?.id ?? null : null,
        } as never)
        .eq("id", onboardingId);
      if (error) {
        if (isMissingSchemaError(error)) {
          throw new Error("Releasing day one needs the 11 Sep migration (20260911140000_sdr_onboarding_structure.sql).");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
  });
}

export interface CompleteStepInput {
  taskId: string;
  done: boolean;
  /** For question / confirm_email steps: the answer that proves completion. */
  answer?: string | null;
  /** For upload_proof steps: the storage path of the uploaded evidence. */
  proofPath?: string | null;
}

export interface CompleteStepOutcome {
  /** True when the answer couldn't be stored because M7 isn't applied. */
  answerDropped: boolean;
}

export function useCompleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, done, answer, proofPath }: CompleteStepInput): Promise<CompleteStepOutcome> => {
      const { data: auth } = await supabase.auth.getUser();
      const base = {
        is_completed: done,
        completed_at: done ? new Date().toISOString() : null,
        completed_by: done ? auth?.user?.id ?? null : null,
      };

      if (answer !== undefined || proofPath !== undefined) {
        const extras = {
          ...(answer !== undefined ? { answer_text: answer } : {}),
          ...(proofPath !== undefined ? { proof_path: proofPath } : {}),
        };
        const { error } = await supabase
          .from("employee_onboarding_tasks")
          .update({ ...base, ...extras } as never)
          .eq("id", taskId);
        if (!error) return { answerDropped: false };
        if (!isMissingSchemaError(error)) throw error;
        // The extras column doesn't exist yet (M7 / docs migration) —
        // complete without it rather than blocking the starter.
        const { error: retryError } = await supabase
          .from("employee_onboarding_tasks")
          .update(base as never)
          .eq("id", taskId);
        if (retryError) throw retryError;
        return { answerDropped: true };
      }

      const { error } = await supabase
        .from("employee_onboarding_tasks")
        .update(base as never)
        .eq("id", taskId);
      if (error) throw error;
      return { answerDropped: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_TASKS_QUERY_KEY });
    },
  });
}

// supabase.functions.invoke reports non-2xx as a generic message; the real
// one is in the JSON body on error.context (same helper as the
// impersonation module).
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      /* body wasn't JSON — fall through */
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export interface ProvisionLoginInput {
  onboardingId: string;
  email: string;
  displayName: string;
  /** employee_onboarding.target_role — the server maps it to the app role. */
  targetRole: string;
}

/**
 * Provision the starter's real login via the create-user edge function's
 * onboarding path. Server-side the function forces in_onboarding_mode=true,
 * restricts the role to the closed four-target map, and links the
 * employee_onboarding record — see AUDIT_ONBOARDING.md §7.4. Returns the
 * generated password — since the invite-email flow it is only ever SHOWN as
 * the fallback when the invite email can't be sent (no personal address /
 * send failure); the happy path emails a set-password link instead.
 *
 * Until the updated function is deployed via the hosted builder Publish, the live one
 * still rejects non-admin callers — surfaced as a clear message.
 */
export function useProvisionOnboardingLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProvisionLoginInput): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("create-user", {
        method: "POST",
        body: {
          email: input.email,
          displayName: input.displayName,
          onboardingTargetRole: input.targetRole,
          onboardingId: input.onboardingId,
        },
      });
      if (error) {
        const message = await functionErrorMessage(error, "Provisioning failed");
        throw new Error(
          message.includes("Insufficient permissions")
            ? `${message} — the updated create-user function likely needs a the hosted builder Publish.`
            : message,
        );
      }
      if (data?.error) throw new Error(data.error as string);
      if (!data?.tempPassword) throw new Error("Provisioning returned no password");
      return data.tempPassword as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
  });
}

export interface SendInviteInput {
  companyEmail: string;
  /** Kept on the record only; since 11 Sep the invite goes to the company mailbox. */
  personalEmail?: string | null;
  fullName: string;
}

/**
 * Email the starter's PERSONAL address the branded "your Vexon OS account is
 * ready" invite, via the onboarding-invite edge function. Server-side it
 * generates a one-shot recovery token for the company account and links to
 * the public /welcome set-password page — no password ever travels through
 * the UI on this path. Throws with the function's message on failure so the
 * caller can fall back to the credentials display.
 *
 * Like create-user, the function isn't live until a the hosted builder Publish.
 */
export function useSendOnboardingInvite() {
  return useMutation({
    mutationFn: async (input: SendInviteInput): Promise<void> => {
      const { data, error } = await supabase.functions.invoke("onboarding-invite", {
        method: "POST",
        body: {
          company_email: input.companyEmail,
          personal_email: input.personalEmail ?? null,
          full_name: input.fullName,
        },
      });
      if (error) {
        throw new Error(await functionErrorMessage(error, "Invite email failed"));
      }
      if (data?.error) throw new Error(data.error as string);
    },
  });
}

/**
 * Release a starter from onboarding mode. Goes through the M7 SECURITY
 * DEFINER function because the TA has no UPDATE policy on profiles — a
 * direct update would silently do nothing (AUDIT_ONBOARDING.md §4). The
 * authorization check (TA capability, or admin/dev) lives inside the
 * function.
 */
export function useReleaseOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (onboardingId: string) => {
      const { error } = await supabase.rpc("release_onboarding" as never, {
        _onboarding_id: onboardingId,
      } as never);
      if (error) {
        if (isMissingSchemaError(error) || error.code === "PGRST202") {
          throw new Error(
            "Release needs migration M7 — run docs/pending-migrations/2026-08-17-onboarding-steps.sql",
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
  });
}
