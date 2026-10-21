import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Escape hatch for tables newer than the generated types (types.ts is stale
// until regenerated — house pattern, same as useSetterReview).
const db: SupabaseClient = supabase;

/**
 * Shared review-creation spine — role-parameterised (Batch A, 2026-07-28).
 *
 * Every role's review engine (setter, account_executive, sdr_manager)
 * compiles its OWN metrics shape, then calls this one function to persist
 * the review row and kick off the narrative. The edge function picks the
 * role's narrative prompt from its registry using the `role` column.
 *
 * Extracted verbatim from generateSetterReview so the setter path's
 * behaviour — including the pre-migration error message — is unchanged.
 */
export interface CreateReviewInput {
  revieweeUserId: string;
  role: "setter" | "account_executive" | "sdr_manager";
  department: string | null;
  periodStart: string;
  periodEnd: string;
  compiled: unknown;
}

export async function createReviewAndStartNarrative(input: CreateReviewInput): Promise<string> {
  const { data: review, error: insertErr } = await db
    .from("performance_reviews")
    .insert({
      reviewee_user_id: input.revieweeUserId,
      role: input.role,
      department: input.department,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      created_by: (await supabase.auth.getUser()).data.user?.id,
      compiled_metrics: input.compiled,
      status: "generating",
    })
    .select("id")
    .single();

  if (insertErr || !review) {
    throw new Error(
      insertErr?.message?.includes("performance_reviews")
        ? "Performance review tables are not migrated yet — apply migration 20260721120000 first."
        : insertErr?.message || "Could not create review",
    );
  }

  const { error: fnError } = await supabase.functions.invoke("performance-review-compile", {
    body: { review_id: review.id },
  });
  if (fnError) {
    await db.from("performance_reviews").update({ status: "failed" }).eq("id", review.id);
    throw new Error(fnError.message || "Could not start narrative generation");
  }

  return review.id as string;
}
