import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileLite {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  offboarded_at: string | null;
}

/**
 * id → profile for name/avatar rendering (project members, task owners).
 * Includes former employees on purpose: a project keeps its history even
 * after a contributor leaves; live pickers use useTeamUsers instead.
 */
export function useProfileLookup() {
  const query = useQuery({
    queryKey: ["profile-lookup"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, offboarded_at");
      if (error) throw error;
      return (data ?? []) as unknown as ProfileLite[];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    (query.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [query.data]);

  const nameFor = (id: string | null | undefined): string =>
    (id && map.get(id)?.full_name) || "Unknown";
  const avatarFor = (id: string | null | undefined): string | null =>
    (id && map.get(id)?.avatar_url) || null;

  return { map, nameFor, avatarFor, isLoading: query.isLoading };
}
