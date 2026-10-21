import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SystemBroadcast = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warn" | "critical" | string;
  active: boolean;
  target_roles: string[];
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
};

async function fetchActive(): Promise<SystemBroadcast[]> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("system_broadcasts")
    .select("*")
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });
  return (data || []) as SystemBroadcast[];
}

export function useSystemBroadcasts(userRoles: string[]) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["system-broadcasts-active"],
    queryFn: fetchActive,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("system_broadcasts_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_broadcasts" },
        () => {
          qc.invalidateQueries({ queryKey: ["system-broadcasts-active"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const visible = data.filter((b) => {
    if (!b.target_roles || b.target_roles.length === 0) return true;
    return userRoles.some((r) => b.target_roles.includes(r));
  });

  return visible;
}
