// Elena's per-starter checklist (3 Sep, R8): the HR-side to-dos for each
// new starter (Revolut, contract saved, meetings, LinkedIn and WhatsApp
// reviewed). Two tables from 20260903160000_sdr_deck_hr_checklist.sql:
//   hr_starter_checklist_templates  — the master list, edited in Dev Center
//   hr_starter_checklist_items      — one row per starter per template key
// Items are materialised from the enabled templates the first time a
// starter's sheet is opened (upsert, ignore duplicates), so adding a template
// later only affects sheets opened after that.
//
// Degrades gracefully before the migration: queries resolve to empty with
// migrationPending=true and the UI shows the amber notice.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError, withMigrationGuard, type GuardedResult } from "@/lib/migrationGuard";

export const HR_CHECKLIST_TEMPLATES_KEY = ["hr-starter-checklist-templates"] as const;
export const HR_CHECKLIST_ITEMS_KEY = ["hr-starter-checklist-items"] as const;

export interface HrChecklistTemplate {
  key: string;
  label: string;
  sort_order: number;
  enabled: boolean;
}

export interface HrChecklistItem {
  id: string;
  employee_onboarding_id: string;
  template_key: string;
  label: string;
  done_at: string | null;
  done_by: string | null;
  note: string | null;
}

const MIGRATION_HINT = "Elena's checklist needs the 3 Sep migration (20260903160000_sdr_deck_hr_checklist.sql).";

/** Every template, including disabled ones (Dev Center editor + materialiser). */
export function useHrChecklistTemplates() {
  return useQuery({
    queryKey: HR_CHECKLIST_TEMPLATES_KEY,
    staleTime: 30_000,
    queryFn: (): Promise<GuardedResult<HrChecklistTemplate[]>> =>
      withMigrationGuard<HrChecklistTemplate[]>(
        () =>
          supabase
            .from("hr_starter_checklist_templates" as never)
            .select("key, label, sort_order, enabled" as never)
            .order("sort_order" as never) as never,
        [],
      ),
  });
}

/** Items for every starter the caller can see; filter by onboarding id client-side. */
export function useHrChecklistItems() {
  return useQuery({
    queryKey: HR_CHECKLIST_ITEMS_KEY,
    staleTime: 30_000,
    queryFn: (): Promise<GuardedResult<HrChecklistItem[]>> =>
      withMigrationGuard<HrChecklistItem[]>(
        () =>
          supabase
            .from("hr_starter_checklist_items" as never)
            .select("id, employee_onboarding_id, template_key, label, done_at, done_by, note" as never) as never,
        [],
      ),
  });
}

/**
 * Create the missing items for one starter from the enabled templates.
 * Idempotent: the unique (employee_onboarding_id, template_key) key plus
 * ignoreDuplicates means re-running never duplicates or resets a tick.
 */
export function useMaterialiseChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ onboardingId, templates }: { onboardingId: string; templates: HrChecklistTemplate[] }) => {
      const rows = templates
        .filter((t) => t.enabled)
        .map((t) => ({ employee_onboarding_id: onboardingId, template_key: t.key, label: t.label }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("hr_starter_checklist_items" as never)
        .upsert(rows as never, { onConflict: "employee_onboarding_id,template_key", ignoreDuplicates: true });
      if (error) {
        if (isMissingSchemaError(error)) throw new Error(MIGRATION_HINT);
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_CHECKLIST_ITEMS_KEY }),
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("hr_starter_checklist_items" as never)
        .update({
          done_at: done ? new Date().toISOString() : null,
          done_by: done ? auth?.user?.id ?? null : null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_CHECKLIST_ITEMS_KEY }),
  });
}

export function useSaveChecklistItemNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string | null }) => {
      const { error } = await supabase
        .from("hr_starter_checklist_items" as never)
        .update({ note } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_CHECKLIST_ITEMS_KEY }),
  });
}

export interface ChecklistTemplateInput {
  key: string;
  label: string;
  sort_order: number;
  enabled: boolean;
}

/** Dev Center: insert or update a template (key is the primary key). */
export function useSaveChecklistTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChecklistTemplateInput) => {
      const { error } = await supabase
        .from("hr_starter_checklist_templates" as never)
        .upsert(input as never, { onConflict: "key" });
      if (error) {
        if (isMissingSchemaError(error)) throw new Error(MIGRATION_HINT);
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HR_CHECKLIST_TEMPLATES_KEY }),
  });
}

export const slugifyChecklistKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "item";
