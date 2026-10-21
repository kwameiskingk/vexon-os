// AE pipeline stage derivation — extracted from AEPipelineDonut (2026-08-06,
// team-tiles session) so the donut and the SDR-manager dashboard tile share
// ONE implementation. There is no deal_stage column anywhere: stage is
// derived — Discovery = acquisition meetings with no status and no discovery
// log yet; Follow-up = interested/unsure logs not converted + non-cancelled
// unconverted pitch calls; Converted = converted_to_client on either table.
// Snapshot semantics preserved from the donut verbatim (all-time converted;
// scope = whatever rows RLS shows the caller). Closed-in-window uses the
// house getUniqueConvertedDeals dedupe so counts agree with the AE surfaces.
import { supabase } from "@/integrations/supabase/client";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";

export interface AePipelineSnapshot {
  discoveryCount: number;
  followUpCount: number;
  followUpValue: number;
  convertedCount: number;
  convertedValue: number;
}

export async function fetchAePipelineSnapshot(): Promise<AePipelineSnapshot> {
  const [pendingDiscoveryRes, allLogsRes, followUpRes, pitchFollowUpRes, convertedDiscoveryRes, convertedPitchRes] =
    await Promise.all([
      supabase.from("meetings").select("id").eq("department", "acquisition").is("status", null),
      supabase.from("sales_discovery_logs").select("meeting_id"),
      supabase
        .from("sales_discovery_logs")
        .select("id, contract_value")
        .in("client_interest", ["interested", "unsure"])
        .eq("converted_to_client", false)
        .is("marked_not_proceeding", null),
      supabase
        .from("pitch_calls")
        .select("id, contract_value")
        .eq("converted_to_client", false)
        .neq("status", "cancelled"),
      supabase.from("sales_discovery_logs").select("id, contract_value").eq("converted_to_client", true),
      supabase.from("pitch_calls").select("id, contract_value").eq("converted_to_client", true),
    ]);

  const loggedMeetingIds = new Set((allLogsRes.data ?? []).map((l) => l.meeting_id));
  const discoveryCount = (pendingDiscoveryRes.data ?? []).filter((m) => !loggedMeetingIds.has(m.id)).length;

  const followUp = followUpRes.data ?? [];
  const pitchFollowUp = pitchFollowUpRes.data ?? [];
  const convertedDiscovery = convertedDiscoveryRes.data ?? [];
  const convertedPitch = convertedPitchRes.data ?? [];

  return {
    discoveryCount,
    followUpCount: followUp.length + pitchFollowUp.length,
    followUpValue:
      followUp.reduce((s, d) => s + (d.contract_value || 0), 0) +
      pitchFollowUp.reduce((s, p) => s + (p.contract_value || 0), 0),
    convertedCount: convertedDiscovery.length + convertedPitch.length,
    convertedValue:
      convertedDiscovery.reduce((s, d) => s + (d.contract_value || 0), 0) +
      convertedPitch.reduce((s, p) => s + (p.contract_value || 0), 0),
  };
}

export interface ClosedDealsWindow {
  count: number;
  value: number;
}

/** Deals converted within [startISO, endISO] (updated_at attribution, same as
 *  the AE bench/detail), deduped pitch-vs-discovery via the house helper. */
export async function fetchClosedDealsInWindow(startISO: string, endISO: string): Promise<ClosedDealsWindow> {
  const from = `${startISO}T00:00:00`;
  const to = `${endISO}T23:59:59`;
  const [pitchRes, discoveryRes] = await Promise.all([
    supabase
      .from("pitch_calls")
      .select("id, discovery_log_id, contract_value, updated_at")
      .eq("converted_to_client", true)
      .gte("updated_at", from)
      .lte("updated_at", to),
    supabase
      .from("sales_discovery_logs")
      .select("id, contract_value, updated_at")
      .eq("converted_to_client", true)
      .gte("updated_at", from)
      .lte("updated_at", to),
  ]);
  const uniqueDeals = getUniqueConvertedDeals(pitchRes.data ?? [], discoveryRes.data ?? []);
  return { count: uniqueDeals.length, value: sumConvertedDealValue(uniqueDeals) };
}
