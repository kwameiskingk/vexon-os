// Sandbox stand-in for the client-onboarding edge function's booking_context
// action (3 Sep). The sandbox has no journey, so it resolves the booking
// card's event slug straight from booking_event_types / booking_event_hosts
// (internal-user read policies). The slot picker then runs against the
// host's LIVE availability; confirming a slot is simulated by the caller and
// never calls booking-create.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SandboxBookingContext {
  event_type_id: string;
  host_user_id: string;
  name: string | null;
  duration_minutes: number | null;
}

export function useSandboxBookingContext(eventSlug: string | null) {
  return useQuery({
    queryKey: ["sandbox-booking-context", eventSlug],
    enabled: !!eventSlug,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<SandboxBookingContext> => {
      const { data: event, error } = await supabase
        .from("booking_event_types" as never)
        .select("id, name, duration_minutes, is_active" as never)
        .eq("slug" as never, eventSlug as never)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const ev = event as unknown as { id: string; name: string | null; duration_minutes: number | null; is_active: boolean } | null;
      if (!ev || !ev.is_active) throw new Error("The onboarding call isn't configured yet. Set the event up under Bookings first.");
      const { data: hosts, error: hostErr } = await supabase
        .from("booking_event_hosts" as never)
        .select("host_user_id, priority" as never)
        .eq("event_type_id" as never, ev.id as never)
        .not("host_user_id" as never, "is", null)
        .order("priority" as never, { ascending: true });
      if (hostErr) throw new Error(hostErr.message);
      const hostId = (hosts as unknown as { host_user_id: string }[] | null)?.[0]?.host_user_id;
      if (!hostId) throw new Error("No host is configured for the onboarding call yet.");
      return { event_type_id: ev.id, host_user_id: hostId, name: ev.name, duration_minutes: ev.duration_minutes };
    },
  });
}
