// Live phone-screen capture for the Ops Command candidate modal.
// One row per cv_screening (unique FK), human-entered only — the
// screening agent never reads or writes candidate_phone_screens, so
// unlike cv_screenings there are no agent-owned columns to avoid here.
//
// The four Elena columns (2026-08-26 migration: age, uk_sold_what,
// cold_mix_band, accent_pass) aren't in generated types yet and may not
// exist on the database — the upsert retries without them and reports the
// drop, so a pre-migration save never fails outright.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import type { Database } from "@/integrations/supabase/types";

export type PhoneScreen =
  Database["public"]["Tables"]["candidate_phone_screens"]["Row"] & {
    age?: number | null;
    uk_sold_what?: string | null;
    cold_mix_band?: string | null;
    accent_pass?: boolean | null;
    current_job_title?: string | null;
    avg_dials_per_day_raw?: string | null;
    avg_appointments_per_month_raw?: string | null;
    has_children?: boolean | null;
    childcare_support?: boolean | null;
    health_adjustments?: boolean | null;
  };

export type PhoneScreenUpsert = Omit<
  Database["public"]["Tables"]["candidate_phone_screens"]["Insert"],
  "id" | "created_at" | "updated_at"
> & {
  age?: number | null;
  uk_sold_what?: string | null;
  cold_mix_band?: string | null;
  accent_pass?: boolean | null;
  current_job_title?: string | null;
  avg_dials_per_day_raw?: string | null;
  avg_appointments_per_month_raw?: string | null;
  has_children?: boolean | null;
  childcare_support?: boolean | null;
  health_adjustments?: boolean | null;
};

// Stripped from the payload when the 2026-08-26 migration hasn't run.
const OPS_LEAD_COLUMNS = ["age", "uk_sold_what", "cold_mix_band", "accent_pass"] as const;
// Stripped first when the 2026-09-01 migration hasn't run (job title, raw
// range answers, children/care + health questions).
const SEPT_COLUMNS = [
  "current_job_title",
  "avg_dials_per_day_raw",
  "avg_appointments_per_month_raw",
  "has_children",
  "childcare_support",
  "health_adjustments",
] as const;

export interface PhoneScreenSaveOutcome {
  /** True when the new-question answers couldn't be stored (migration pending). */
  newAnswersDropped: boolean;
}

export const phoneScreenQueryKey = (cvScreeningId: string) =>
  ["phone-screen", cvScreeningId] as const;

export function usePhoneScreen(cvScreeningId: string | null) {
  return useQuery({
    queryKey: phoneScreenQueryKey(cvScreeningId ?? "none"),
    enabled: cvScreeningId !== null,
    queryFn: async (): Promise<PhoneScreen | null> => {
      const { data, error } = await supabase
        .from("candidate_phone_screens")
        .select("*")
        .eq("cv_screening_id", cvScreeningId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertPhoneScreen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PhoneScreenUpsert): Promise<PhoneScreenSaveOutcome> => {
      const { error } = await supabase
        .from("candidate_phone_screens")
        .upsert(payload as never, { onConflict: "cv_screening_id" });
      if (!error) return { newAnswersDropped: false };
      if (!isMissingSchemaError(error)) throw error;

      // Newest columns first: most rows only lack the 1 Sep set.
      const noSept = { ...payload } as Record<string, unknown>;
      for (const col of SEPT_COLUMNS) delete noSept[col];
      const { error: septError } = await supabase
        .from("candidate_phone_screens")
        .upsert(noSept as never, { onConflict: "cv_screening_id" });
      if (!septError) return { newAnswersDropped: true };
      if (!isMissingSchemaError(septError)) throw septError;

      const legacy = { ...noSept };
      for (const col of OPS_LEAD_COLUMNS) delete legacy[col];
      const { error: retryError } = await supabase
        .from("candidate_phone_screens")
        .upsert(legacy as never, { onConflict: "cv_screening_id" });
      if (retryError) throw retryError;
      return { newAnswersDropped: true };
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({
        queryKey: phoneScreenQueryKey(payload.cv_screening_id),
      });
    },
  });
}
