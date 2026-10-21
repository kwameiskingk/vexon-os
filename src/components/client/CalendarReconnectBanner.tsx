// Shown on the client's dashboard when their connected calendar has stopped
// working (11 Sep; Marcus and Daniel, 8 Sep, after Locumsmart). Status
// comes from client_calendar_status(), a SECURITY DEFINER function that
// returns only the status of the caller's own connection — clients have no
// direct read on calendar_connections and must not get one (tokens).
//
// The client cannot reconnect from here on their own: a fresh connect link
// is minted by the CSM (Client profile → Bookings → Send connect email), and
// the CSM was notified the moment the connection broke.

import { useQuery } from "@tanstack/react-query";
import { CalendarX2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/migrationGuard";

interface StatusRow {
  client_profile_id: string;
  status: string | null;
  last_checked_at: string | null;
}

export function useClientCalendarStatus(clientProfileId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["client-calendar-status", clientProfileId],
    enabled: !!clientProfileId && enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<StatusRow | null> => {
      const { data, error } = await supabase.rpc("client_calendar_status" as never);
      if (error) {
        // Before migration 20260911130000 the function does not exist: no banner.
        if (isMissingSchemaError(error)) return null;
        throw error;
      }
      const rows = (data as unknown as StatusRow[] | null) ?? [];
      return rows.find((r) => r.client_profile_id === clientProfileId) ?? null;
    },
  });
}

export function CalendarReconnectBanner({ clientProfileId, enabled = true }: { clientProfileId: string | null; enabled?: boolean }) {
  const { data } = useClientCalendarStatus(clientProfileId, enabled);
  if (data?.status !== "error") return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="alert">
      <CalendarX2 className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-amber-800 dark:text-amber-300">Your calendar has disconnected</p>
        <p className="text-amber-800/90 dark:text-amber-200/90 mt-0.5">
          Meetings we book will still go ahead, but they cannot land in your diary until it is reconnected. Your Customer
          Success Manager has been notified and will send you a new connection link by email; it takes about thirty seconds
          to approve.
        </p>
      </div>
    </div>
  );
}
