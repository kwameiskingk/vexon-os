import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Flow-level settings for the new-starter deck (onboarding_flow_settings,
 * one row; migration 20260911140000). Carries what is not a card: the
 * "Before you start is complete" screen (day-one itinerary + who to contact,
 * shown while day one is still locked) and the closing video that plays
 * before the finish card. Reads degrade to the defaults before the
 * migration runs.
 */

// Escape hatch for tables newer than the generated types (house pattern).
const db: SupabaseClient = supabase;

export interface OnboardingFlowSettings {
  pre_start_end_title: string;
  pre_start_end_body: string;
  contact_name: string | null;
  contact_email: string | null;
  finish_video_path: string | null;
  finish_video_url: string | null;
  finish_thumbnail_path: string | null;
}

export const ONBOARDING_FLOW_SETTINGS_KEY = ["onboarding-flow-settings"] as const;

export const DEFAULT_ONBOARDING_FLOW_SETTINGS: OnboardingFlowSettings = {
  pre_start_end_title: "You are ready for day one.",
  pre_start_end_body:
    "Your day-one cards open here once HR releases them on the morning. Until then there is nothing more to do; if anything is unclear or you need help before you start, please get in touch.",
  contact_name: "Elena",
  contact_email: null,
  finish_video_path: null,
  finish_video_url: null,
  finish_thumbnail_path: null,
};

export function useOnboardingFlowSettings(enabled = true) {
  return useQuery({
    queryKey: ONBOARDING_FLOW_SETTINGS_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OnboardingFlowSettings> => {
      const { data, error } = await db
        .from("onboarding_flow_settings")
        .select("pre_start_end_title, pre_start_end_body, contact_name, contact_email, finish_video_path, finish_video_url, finish_thumbnail_path")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) return DEFAULT_ONBOARDING_FLOW_SETTINGS;
      return { ...DEFAULT_ONBOARDING_FLOW_SETTINGS, ...(data as Partial<OnboardingFlowSettings>) };
    },
  });
}

export async function saveOnboardingFlowSettings(patch: Partial<OnboardingFlowSettings>, userId: string | undefined) {
  const { error } = await db
    .from("onboarding_flow_settings")
    .upsert({ id: 1, ...patch, updated_by: userId ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}
