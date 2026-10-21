import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type MaintenanceState = {
  maintenance_mode: boolean;
  maintenance_message: string | null;
  maintenance_restricted_roles: string[] | null;
};

export function useMaintenanceMode() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["system-maintenance"],
    queryFn: async (): Promise<MaintenanceState> => {
      const { data } = await supabase
        .from("system_settings")
        .select("maintenance_mode, maintenance_message, maintenance_restricted_roles")
        .limit(1)
        .maybeSingle();
      return (
        (data as MaintenanceState) || {
          maintenance_mode: false,
          maintenance_message: null,
          maintenance_restricted_roles: null,
        }
      );
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("system_settings_maintenance")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload: any) => {
          queryClient.setQueryData(["system-maintenance"], {
            maintenance_mode: !!payload.new?.maintenance_mode,
            maintenance_message: payload.new?.maintenance_message ?? null,
            maintenance_restricted_roles:
              payload.new?.maintenance_restricted_roles ?? null,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    isMaintenance: !!data?.maintenance_mode,
    message: data?.maintenance_message as string | null,
    restrictedRoles: (data?.maintenance_restricted_roles ?? null) as string[] | null,
    isLoading,
  };
}
