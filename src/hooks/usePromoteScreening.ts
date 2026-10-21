// The bridge between the screening funnel and the hiring pipeline.
//
// cv_screenings and candidates were two unlinked tables (AUDIT_TA_PORTAL.md
// §6.4) — a screened person had to be re-typed by hand into the hiring board.
// Booking an LCT is the moment the two meet, so that is where the link is
// made: promote the screening into a candidates row (or attach an existing
// one matched on LOWER(email), the house join convention) and write the id
// back to cv_screenings.candidate_id.
//
// Deliberately a separate mutation from useUpdateCvScreeningReview, which
// stays narrowed to the two human-owned review columns.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import { CV_SCREENINGS_QUERY_KEY } from "./useCvScreenings";
import { HIRING_PIPELINE_QUERY_KEY } from "./useHiringPipeline";

export interface PromoteInput {
  cvScreeningId: string;
  fullName: string;
  /** 11 Sep: the row's own split names when the import carried them; fullName is split otherwise. */
  firstName?: string | null;
  lastName?: string | null;
  /** 11 Sep: the Close lead link, carried onto the candidate for the live call trial. */
  closeLeadUrl?: string | null;
  /** Confirmed on the call — cv_screenings.email is often absent. */
  email: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  /** LCT date (yyyy-mm-dd) and time (HH:mm). */
  lctDate: string;
  lctTime?: string | null;
  /** Set when the screening already carries a link. */
  existingCandidateId?: string | null;
  /**
   * Where the candidate came from (screening_tool / typeform / headhunt, or
   * a CSV's as-given value). Only pass once candidates.source exists
   * (useCandidateSourceColumn) — omitted, the column is never touched, so
   * booking keeps working on a pre-migration database.
   */
  source?: string;
}

/** "Jane Alice Doe" -> { first: "Jane", last: "Alice Doe" }. */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Unknown", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export class MigrationPendingError extends Error {
  constructor() {
    super(
      "Booking needs the pipeline migration (M4) — run 2026-08-14-ta-portal-and-hiring-pipeline.sql, section M4.",
    );
    this.name = "MigrationPendingError";
  }
}

export function usePromoteScreeningToCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PromoteInput): Promise<string> => {
      const { first, last } = input.firstName?.trim()
        ? { first: input.firstName.trim(), last: (input.lastName ?? "").trim() }
        : splitName(input.fullName);
      const email = input.email.trim();

      // 1. Already linked? Just move that candidate.
      let candidateId = input.existingCandidateId ?? null;

      // 2. Otherwise try to attach an existing candidate by email
      //    (LOWER(email) matching is the platform convention).
      if (!candidateId && email) {
        // limit(1) rather than maybeSingle(): candidates has no unique index
        // on email, and a duplicate must not turn a booking into an error.
        const { data: matches, error: matchError } = await supabase
          .from("candidates")
          .select("id")
          .ilike("email", email)
          .order("date_of_call", { ascending: false, nullsFirst: false })
          .limit(1);
        if (matchError) throw matchError;
        candidateId = matches?.[0]?.id ?? null;
      }

      // 22 Sep 2026: booking from the call list puts someone on a TRIAL DAY,
      // not a Live Call Trial. No login is created here — the trialist account
      // and its set-password email are made on the day, from Trial Day. The
      // email is simply stored on the candidate row.
      const stagePayload = {
        stage_key: "trial_day",
        trial_day_date: input.lctDate,
        date_of_call: input.lctDate,
        cv_screening_id: input.cvScreeningId,
        // Origin tag — only present when the caller confirmed the column
        // exists, so a pre-migration database never sees it.
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.closeLeadUrl ? { close_lead_url: input.closeLeadUrl } : {}),
      };

      if (candidateId) {
        const { error } = await supabase
          .from("candidates")
          .update(stagePayload as never)
          .eq("id", candidateId);
        if (error) {
          if (isMissingSchemaError(error)) throw new MigrationPendingError();
          throw error;
        }
      } else {
        // 3. Create the pipeline record.
        const { data, error } = await supabase
          .from("candidates")
          .insert({
            first_name: first,
            last_name: last,
            email,
            mobile_phone: input.phone || null,
            linkedin_url: input.linkedinUrl || null,
            ...stagePayload,
          } as never)
          .select("id")
          .single();
        if (error) {
          if (isMissingSchemaError(error)) throw new MigrationPendingError();
          throw error;
        }
        candidateId = (data as { id: string }).id;
      }

      // 4. Write the link back. Guarded separately so a pre-M4 database
      //    fails here with a clear message rather than silently orphaning.
      const { error: linkError } = await supabase
        .from("cv_screenings")
        .update({ candidate_id: candidateId } as never)
        .eq("id", input.cvScreeningId);
      if (linkError) {
        if (isMissingSchemaError(linkError)) throw new MigrationPendingError();
        throw linkError;
      }

      return candidateId!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
    },
  });
}
