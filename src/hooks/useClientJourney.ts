// Client-portal hooks for the onboarding journey. Everything flows through the
// client-onboarding edge function — the journey tables are read-only to client
// logins, and stage locking is enforced server-side.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CLIENT_JOURNEY_QUERY_KEY = ["client-journey"];

export interface JourneyTask {
  id: string;
  step_key: string;
  label: string;
  description: string | null;
  step_type: string;
  config: Record<string, unknown>;
  video_url: string | null;
  document_path: string | null;
  link_url: string | null;
  sort_order: number;
  is_completed: boolean;
  waived_at: string | null;
  answers: Record<string, unknown> | null;
  file_path: string | null;
  booking_id: string | null;
}

export interface JourneyStage {
  stage_key: string;
  title: string;
  subtitle: string | null;
  order: number;
  state: "complete" | "active" | "locked";
  tasks: JourneyTask[];
}

export interface ClientJourneyData {
  journey: {
    status: string;
    campaign_live_at: string | null;
    released_at?: string | null;
    started_at?: string;
  } | null;
  client?: {
    client_profile_id: string;
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  };
  stages?: JourneyStage[];
  progress_pct?: number;
  calendar_connection?: { status: string; calendar_email: string | null } | null;
}

async function invokeJourney(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("client-onboarding", { body });
  if (error) {
    // Supabase functions client hides the response body on non-2xx — surface it.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || "Something went wrong");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useClientJourney(enabled = true) {
  return useQuery<ClientJourneyData>({
    queryKey: CLIENT_JOURNEY_QUERY_KEY,
    queryFn: () => invokeJourney({ action: "journey" }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Lightweight containment check used by DashboardLayout: is an onboarding
 * journey still in progress for this client login? Reads the table directly
 * via the client's own SELECT policy — no edge function round-trip. */
export function useClientJourneyGate(enabled: boolean) {
  return useQuery({
    queryKey: ["client-journey-gate"],
    queryFn: async () => {
      // Scope to the caller's own client profiles — staff RLS sees every
      // journey, and the demo portal renders this layout for admins/AEs.
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return false;
      const [{ data: junction }, { data: legacy }] = await Promise.all([
        supabase.from("client_profile_users").select("client_profile_id").eq("user_id", uid),
        supabase.from("client_profiles").select("id").eq("user_id", uid),
      ]);
      const ids = [
        ...new Set([
          ...(junction || []).map((r) => r.client_profile_id),
          ...(legacy || []).map((r) => r.id),
        ]),
      ];
      if (ids.length === 0) return false;
      const { data } = await supabase
        .from("client_onboarding_journeys" as never)
        .select("status" as never)
        .in("client_profile_id" as never, ids as never[])
        .eq("status" as never, "active" as never)
        .limit(1);
      return ((data as unknown as { status?: string }[]) || []).length > 0;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useCompleteJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { step_key: string } & Record<string, unknown>) =>
      invokeJourney({ action: "complete_step", ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENT_JOURNEY_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["client-journey-gate"] });
    },
  });
}

/** 2 Oct: "Mark as not complete" — the client's own finished card goes back in front of them. */
export function useReopenJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { step_key: string }) => invokeJourney({ action: "reopen_step", ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENT_JOURNEY_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["client-journey-gate"] });
    },
  });
}

/** 3 Sep: edit a completed card in place (form / yes_no / text_list / upload). */
export function useUpdateAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { step_key: string } & Record<string, unknown>) =>
      invokeJourney({ action: "update_answers", ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENT_JOURNEY_QUERY_KEY }),
  });
}

/** 3 Sep: the client releases themselves once every card is done. */
export function useGoToDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invokeJourney({ action: "go_to_dashboard" }),
    onSuccess: () => {
      // Flip the portal gate synchronously: DashboardLayout reads this cached
      // value and would otherwise bounce the client back here until the
      // refetch lands.
      qc.setQueryData(["client-journey-gate"], false);
      qc.invalidateQueries({ queryKey: CLIENT_JOURNEY_QUERY_KEY });
    },
  });
}

export function useSaveFormDraft() {
  return useMutation({
    mutationFn: (input: { step_key: string; answers: Record<string, unknown> }) =>
      invokeJourney({ action: "save_form_draft", ...input }),
  });
}

export function useBookingContext(stepKey: string | null) {
  return useQuery({
    queryKey: ["client-journey-booking-context", stepKey],
    queryFn: () => invokeJourney({ action: "booking_context", step_key: stepKey }),
    enabled: !!stepKey,
    staleTime: 60_000,
    retry: false,
  });
}

export interface ClientBookableEventContext {
  event_type_id: string;
  host_user_id: string;
  name: string;
  duration_minutes: number;
  accepting_bookings: boolean;
  lock_timezone: string | null;
  client: {
    client_profile_id: string;
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

/** The catch-up event clients book from Communications (3 Sep). */
export const CLIENT_CATCHUP_EVENT_SLUG = "catch-up-with-daniel-msp";

/**
 * Resolves a client-bookable event (allow-listed server-side) for the
 * in-portal slot picker, independent of the onboarding journey, so released
 * and pre-journey clients can book too. Clients cannot read the booking
 * tables directly, hence the edge-function read path.
 */
export function useClientBookableEvent(slug: string | null) {
  return useQuery<ClientBookableEventContext>({
    queryKey: ["client-bookable-event", slug],
    queryFn: () => invokeJourney({ action: "event_context", event_slug: slug }),
    enabled: !!slug,
    staleTime: 60_000,
    retry: false,
  });
}

export function useConnectCalendarUrl() {
  return useMutation({
    mutationFn: () => invokeJourney({ action: "connect_url" }),
  });
}
