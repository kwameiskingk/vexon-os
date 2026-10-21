import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Flow-level settings for the client onboarding deck (client_flow_settings,
 * one row). First use: the finish-screen video (Daniel's "onboarding
 * complete" recording) — the finish screen is not a card, so it has no
 * client_flow_steps row to carry media. Reads degrade to "nothing set"
 * before the migration runs; the deck simply shows no intro.
 */

// Escape hatch for tables newer than the generated types (house pattern).
const db: SupabaseClient = supabase;

export interface ClientFlowSettings {
  finish_video_path: string | null;
  finish_video_url: string | null;
  finish_thumbnail_path: string | null;
}

export const CLIENT_FLOW_SETTINGS_KEY = ["client-flow-settings"] as const;

export const EMPTY_CLIENT_FLOW_SETTINGS: ClientFlowSettings = {
  finish_video_path: null,
  finish_video_url: null,
  finish_thumbnail_path: null,
};

export function useClientFlowSettings(enabled = true) {
  return useQuery({
    queryKey: CLIENT_FLOW_SETTINGS_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ClientFlowSettings> => {
      const { data, error } = await db
        .from("client_flow_settings")
        .select("finish_video_path, finish_video_url, finish_thumbnail_path")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) return EMPTY_CLIENT_FLOW_SETTINGS;
      return data as ClientFlowSettings;
    },
  });
}

export async function saveClientFlowSettings(patch: Partial<ClientFlowSettings>, userId: string | undefined) {
  const { error } = await db
    .from("client_flow_settings")
    .upsert({ id: 1, ...patch, updated_by: userId ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}
