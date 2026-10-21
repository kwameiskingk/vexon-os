// Trial Day (15 Sep 2026) — every read and write around trial_leads,
// trial_day_settings and the trialist login, in one place.
//
// Writes that touch profiles, user_roles or notifications go through the
// SECURITY DEFINER functions in migration 20260915120000 (the TA has no
// UPDATE policy on profiles; notifications INSERT is service-role only).
// Reads are plain selects under the table's own RLS: a trialist sees their
// rows, a setter sees what was pushed to them, reviewers see everything.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import { functionErrorMessage } from "@/hooks/useEmployeeOnboarding";

// Escape hatch for tables newer than the generated types (house pattern).
const db: SupabaseClient = supabase;

export type TrialLeadStatus = "submitted" | "pushed" | "converted" | "rejected";

export interface ProposedTime {
  date: string; // YYYY-MM-DD, London
  time: string; // HH:MM
}

export interface JobRoleEntry {
  title: string;
  salary: number | null;
  currency: "GBP" | "USD" | "EUR" | "ZAR";
}

export interface TrialLead {
  id: string;
  candidate_id: string;
  trialist_user_id: string;
  client_profile_id: string | null;
  close_lead_link: string;
  company_name: string | null;
  company_website: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_mobile: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  currently_hiring: boolean | null;
  job_roles: JobRoleEntry[];
  job_spec_provided: boolean | null;
  open_to_receiving_cvs: boolean | null;
  cv_candidate_titles: string | null;
  cv_candidate_level: string | null;
  other_decision_makers: boolean | null;
  decision_maker_status: "joining" | "briefed_by_prospect" | "email_pending" | null;
  decision_maker_email: string | null;
  push_through_reason: string | null;
  proposed_times: ProposedTime[];
  trialist_notes: string | null;
  /** 16 Oct 2026: "phone" = callback; null on leads logged before then. */
  location_choice?: "video" | "phone" | null;
  /** 16 Oct 2026: the picked times, first choice first. */
  chosen_times?: string[] | null;
  status: TrialLeadStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  pushed_to_user_id: string | null;
  pushed_at: string | null;
  converted_meeting_id: string | null;
  converted_by: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Joined for reviewers: who logged it and which client campaign. */
  trialist?: { id: string; full_name: string | null; email: string | null } | null;
  client?: { id: string; company_name: string | null } | null;
  pushed_to?: { id: string; full_name: string | null; email: string | null } | null;
}

export const TRIAL_LEADS_KEY = ["trial-leads"] as const;
export const TRIAL_SETTINGS_KEY = ["trial-day-settings"] as const;

const LEAD_SELECT =
  "*, trialist:profiles!trial_leads_trialist_user_id_fkey(id, full_name, email), client:client_profiles(id, company_name), pushed_to:profiles!trial_leads_pushed_to_user_id_fkey(id, full_name, email)";

const normalise = (row: Record<string, unknown>): TrialLead => ({
  ...(row as unknown as TrialLead),
  job_roles: Array.isArray(row.job_roles) ? (row.job_roles as JobRoleEntry[]) : [],
  proposed_times: Array.isArray(row.proposed_times) ? (row.proposed_times as ProposedTime[]) : [],
});

// ── Settings (one row) ─────────────────────────────────────────────────────

export interface TrialPackSection {
  title: string;
  body: string;
  url: string;
  url_label: string;
}

export interface TrialDaySettings {
  /** The trial-day pack (Marcus's list): rendered as expandable cards. */
  sections: TrialPackSection[];
  intro_title: string;
  intro_body: string;
  doc_url: string | null;
  doc_label: string;
  video_url: string | null;
  video_label: string;
  embed_mode: boolean;
  embed_video_url: string | null;
  embed_title: string | null;
}

export const DEFAULT_TRIAL_DAY_SETTINGS: TrialDaySettings = {
  sections: [],
  intro_title: "How today's trial day goes",
  // 16 Oct 2026 (the owner). Dev Centre > Trialist access can still change it.
  intro_body:
    "1. By now you will have your trial pack from Elena, and a walkthrough of Close, our CRM.\n\n2. On this platform you will be logging meeting-ready leads on behalf of the client you are representing.\n\n3. Whether the prospect wants a video call or a callback, get more than one time that works for them, so the meeting can be booked with the client.",
  doc_url: null,
  doc_label: "Trial-day briefing",
  video_url: null,
  video_label: "Close walkthrough",
  embed_mode: false,
  embed_video_url: null,
  embed_title: null,
};

export function useTrialDaySettings(enabled = true) {
  return useQuery({
    queryKey: TRIAL_SETTINGS_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TrialDaySettings> => {
      const { data, error } = await db.from("trial_day_settings").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return DEFAULT_TRIAL_DAY_SETTINGS;
      const row = data as Partial<TrialDaySettings>;
      return { ...DEFAULT_TRIAL_DAY_SETTINGS, ...row, sections: Array.isArray(row.sections) ? row.sections : [] };
    },
  });
}

export function useSaveTrialDaySettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<TrialDaySettings>) => {
      const { error } = await db
        .from("trial_day_settings")
        .upsert({ id: 1, ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRIAL_SETTINGS_KEY }),
  });
}

// ── Leads ──────────────────────────────────────────────────────────────────

/** The signed-in trialist's own leads (RLS scopes the select). */
export function useMyTrialLeads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...TRIAL_LEADS_KEY, "mine", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrialLead[]> => {
      // No client join here: the trialist never sees a real client name
      // (18 Sep). TrialHome labels rows with the alias from trial_active_clients.
      const { data, error } = await db
        .from("trial_leads")
        .select("*")
        .eq("trialist_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingSchemaError(error)) return [];
        throw error;
      }
      return (data ?? []).map(normalise);
    },
  });
}

/** Reviewer view: every lead, joined with who logged it and the client. */
export function useAllTrialLeads(enabled = true) {
  return useQuery({
    queryKey: [...TRIAL_LEADS_KEY, "all"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrialLead[]> => {
      const { data, error } = await db.from("trial_leads").select(LEAD_SELECT).order("created_at", { ascending: false }).limit(500);
      if (error) {
        if (isMissingSchemaError(error)) return [];
        throw error;
      }
      return (data ?? []).map(normalise);
    },
  });
}

/** Setter view: leads pushed to me and not yet converted. */
export function usePushedTrialLeads(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...TRIAL_LEADS_KEY, "pushed", user?.id],
    enabled: enabled && !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrialLead[]> => {
      const { data, error } = await db
        .from("trial_leads")
        .select("*, trialist:profiles!trial_leads_trialist_user_id_fkey(id, full_name, email), client:client_profiles(id, company_name)")
        .eq("pushed_to_user_id", user!.id)
        .eq("status", "pushed")
        .order("pushed_at", { ascending: false });
      if (error) {
        if (isMissingSchemaError(error)) return [];
        throw error;
      }
      return (data ?? []).map(normalise);
    },
  });
}

/** Sidebar pill for reviewers: leads waiting for QA. */
export function useTrialLeadsToReviewCount(enabled: boolean) {
  return useQuery({
    queryKey: [...TRIAL_LEADS_KEY, "count-submitted"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await db.from("trial_leads").select("id", { count: "exact", head: true }).eq("status", "submitted");
      if (error) {
        if (isMissingSchemaError(error)) return 0;
        throw error;
      }
      return count ?? 0;
    },
  });
}

/** Sidebar pill for a setter: leads pushed to me, still to book. */
export function usePushedTrialLeadsCount(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...TRIAL_LEADS_KEY, "count-pushed", userId],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await db
        .from("trial_leads")
        .select("id", { count: "exact", head: true })
        .eq("pushed_to_user_id", userId!)
        .eq("status", "pushed");
      if (error) {
        if (isMissingSchemaError(error)) return 0;
        throw error;
      }
      return count ?? 0;
    },
  });
}

/** A client as the trialist sees it: id + alias ("Client A"), never the name. */
export interface TrialClientOption {
  id: string;
  label: string;
}

/**
 * What a trialist may pick as "calling for": the clients Elena assigned on
 * the candidate card (candidates.trial_client_ids), each under its trial name
 * ("B Recruitment", 16 Oct 2026). Unassigned → every live client, still under
 * trial names. The real name never reaches the trialist (18 Sep, the owner).
 */
export function useTrialActiveClients(enabled = true) {
  return useQuery({
    queryKey: ["trial-active-clients"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TrialClientOption[]> => {
      const { data, error } = await db.rpc("trial_active_clients");
      if (error) {
        if (isMissingSchemaError(error) || error.code === "PGRST202") return [];
        throw error;
      }
      return ((data ?? []) as Array<{ id: string; label?: string; company_name?: string }>).map((c, i) => ({
        id: c.id,
        // Pre-migration shape returned company_name; never show it, so a stale
        // function cannot leak a name.
        label: c.label ?? `Client ${String.fromCharCode(65 + i)}`,
      }));
    },
  });
}

/** Staff side: live clients by real name and trial name, for assigning to a
 * trialist. Test accounts (Meridian Sales Partners) are left out by the RPC. */
export function useTrialAssignableClients(enabled = true) {
  return useQuery({
    queryKey: ["trial-assignable-clients"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<{ id: string; company_name: string; trial_alias: string | null }>> => {
      const { data, error } = await db.rpc("trial_assignable_clients");
      if (error) {
        if (isMissingSchemaError(error) || error.code === "PGRST202") return [];
        throw error;
      }
      return ((data ?? []) as Array<{ id: string; company_name: string; trial_alias?: string | null }>)
        .map((c) => ({ ...c, trial_alias: c.trial_alias ?? null }));
    },
  });
}

/** Rename a client's trial name (Elena, 16 Oct 2026). */
export function useSetTrialAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; alias: string }) => {
      const { error } = await db.rpc("set_trial_alias", { _client_id: input.clientId, _alias: input.alias });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trial-assignable-clients"] });
      qc.invalidateQueries({ queryKey: ["trial-active-clients"] });
    },
  });
}

/** Save which clients a trialist dials for (order = alias order). */
export function useSetTrialClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; clientIds: string[] }) => {
      const { error } = await db
        .from("candidates")
        .update({ trial_client_ids: input.clientIds } as never)
        .eq("id", input.candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring-pipeline"] });
      qc.invalidateQueries({ queryKey: ["trial-active-clients"] });
    },
  });
}

export interface SubmitTrialLeadInput {
  client_profile_id: string | null;
  close_lead_link: string;
  company_name: string;
  company_website: string;
  contact_name: string;
  contact_title: string;
  contact_mobile: string;
  contact_email: string;
  linkedin_url: string;
  currently_hiring: boolean | null;
  job_roles: JobRoleEntry[];
  job_spec_provided: boolean | null;
  open_to_receiving_cvs: boolean | null;
  cv_candidate_titles: string;
  cv_candidate_level: string;
  other_decision_makers: boolean | null;
  decision_maker_status: "" | "joining" | "briefed_by_prospect" | "email_pending";
  decision_maker_email: string;
  push_through_reason: string;
  /** Written by the server from chosen_times since 16 Oct 2026; older callers sent it. */
  proposed_times?: ProposedTime[];
  trialist_notes: string;
  /** 16 Oct 2026: picked on the client's real free times. "phone" = callback. */
  location_choice: "video" | "phone";
  /** ISO instants: the prospect's first choice, then the others (2 to 3). */
  chosen_times: string[];
}

export function useSubmitTrialLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitTrialLeadInput): Promise<string> => {
      const { data, error } = await db.rpc("submit_trial_lead", { _payload: input });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRIAL_LEADS_KEY }),
  });
}

export function useRejectTrialLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; reason: string }) => {
      const { error } = await db.rpc("reject_trial_lead", { _lead_id: input.leadId, _reason: input.reason });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRIAL_LEADS_KEY }),
  });
}

/** Link a freshly logged meeting back to the lead it came from. */
export async function convertTrialLead(leadId: string, meetingId: string): Promise<void> {
  const { error } = await db.rpc("convert_trial_lead", { _lead_id: leadId, _meeting_id: meetingId });
  if (error) throw new Error(error.message);
}

// ── The trialist login (Elena's card + the Dev Centre) ────────────────────

export interface CreateTrialistLoginInput {
  candidateId: string;
  email: string;
  displayName: string;
}

/** create-user's trialist path: account in trial mode, role trialist, linked to the candidate. */
export function useCreateTrialistLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTrialistLoginInput): Promise<{ userId: string; tempPassword: string }> => {
      const { data, error } = await supabase.functions.invoke("create-user", {
        method: "POST",
        body: { trialist: true, candidateId: input.candidateId, email: input.email, displayName: input.displayName },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Could not create the trialist login"));
      if (data?.error) throw new Error(data.error as string);
      return { userId: data.user.id as string, tempPassword: data.tempPassword as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring-pipeline"] });
      qc.invalidateQueries({ queryKey: ["trialists"] });
    },
  });
}

/** onboarding-invite with the trial flag: set-password link to the trialist's address. */
export function useSendTrialistInvite() {
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string }) => {
      const { data, error } = await supabase.functions.invoke("onboarding-invite", {
        method: "POST",
        body: { company_email: input.email, full_name: input.fullName, trial: true },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Invite email failed"));
      if (data?.error) throw new Error(data.error as string);
    },
  });
}

export function useEndTrialAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await db.rpc("end_trial_access", { _candidate_id: candidateId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring-pipeline"] });
      qc.invalidateQueries({ queryKey: ["trialists"] });
    },
  });
}

/** Passed the trial: the same login walks into onboarding (no second account). */
export function useTrialistToOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; onboardingId: string; targetRole: string }) => {
      const { error } = await db.rpc("trialist_to_onboarding", {
        _candidate_id: input.candidateId,
        _onboarding_id: input.onboardingId,
        _target_role: input.targetRole,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring-pipeline"] });
      qc.invalidateQueries({ queryKey: ["employee-onboarding"] });
      qc.invalidateQueries({ queryKey: ["trialists"] });
    },
  });
}

export interface TrialistRow {
  candidate_id: string;
  first_name: string;
  last_name: string;
  email: string;
  stage_key: string | null;
  trial_day_date: string | null;
  trialist_user_id: string | null;
  profile?: { id: string; email: string | null; full_name: string | null; in_trial_mode: boolean; offboarded_at: string | null } | null;
}

/** Dev Centre: every candidate that has (or had) a trialist login. */
export function useTrialists(enabled = true) {
  return useQuery({
    queryKey: ["trialists"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrialistRow[]> => {
      const { data, error } = await db
        .from("candidates")
        .select("id, first_name, last_name, email, stage_key, trial_day_date, trialist_user_id, profile:profiles!candidates_trialist_user_id_fkey(id, email, full_name, in_trial_mode, offboarded_at)")
        .or("trialist_user_id.not.is.null,stage_key.eq.trial_day")
        .order("trial_day_date", { ascending: false, nullsFirst: false });
      if (error) {
        if (isMissingSchemaError(error)) return [];
        throw error;
      }
      return (data ?? []).map((r: Record<string, unknown>) => ({
        candidate_id: r.id as string,
        first_name: r.first_name as string,
        last_name: r.last_name as string,
        email: r.email as string,
        stage_key: (r.stage_key as string | null) ?? null,
        trial_day_date: (r.trial_day_date as string | null) ?? null,
        trialist_user_id: (r.trialist_user_id as string | null) ?? null,
        profile: (r.profile as TrialistRow["profile"]) ?? null,
      }));
    },
  });
}

export const formatProposedTime = (t: ProposedTime): string => {
  try {
    const d = new Date(`${t.date}T${t.time || "00:00"}:00`);
    return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${t.time ? ` ${t.time}` : ""}`;
  } catch {
    return `${t.date} ${t.time}`;
  }
};

export const trialLeadStatusLabel: Record<TrialLeadStatus, string> = {
  submitted: "With Elena",
  // Leads pushed to a setter before 16 Oct; nothing is pushed any more.
  pushed: "With a setter",
  converted: "Booked",
  rejected: "Not a fit",
};
