import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientHealthSnapshotResponse } from "@/lib/clientHealthSnapshot";

const FIVE_MIN = 5 * 60 * 1000;

export const useClientHealthSnapshot = () =>
  useQuery({
    queryKey: ["client-health-snapshot"],
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<ClientHealthSnapshotResponse> => {
      const { data, error } = await supabase.functions.invoke(
        "fetch-client-health-snapshot",
        { body: {} }
      );
      if (error) throw new Error(error.message || "Failed to load snapshot");
      if (!data || (data as any).error) {
        throw new Error((data as any)?.error || "Failed to load snapshot");
      }
      return data as ClientHealthSnapshotResponse;
    },
  });
