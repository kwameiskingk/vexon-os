// Dev Centre › Health (rebuilt 15 Oct 2026, the owner's ruling: cron +
// connections + important errors only, no per-function run logging yet).
//   Scheduled jobs: every pg_cron job with its last run (dev_cron_status(),
//     migration 20261015190000).
//   Calendar connections needing attention: Kronos connections in error, or
//     invited more than a week ago and still not connected.
//   Import errors: unresolved sync_errors (Close API, CSV import,
//     consolidation) with a Resolve action.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";

// dev_cron_status() reaches types.ts on the next the hosted builder sync.
const sb = supabase as unknown as SupabaseClient;

type CronRow = {
  jobname: string; schedule: string; active: boolean; target: string | null;
  last_start: string | null; last_end: string | null; last_status: string | null; last_message: string | null;
  runs_24h: number; failures_24h: number;
};
type ConnRow = {
  id: string; owner_type: string; provider: string; status: string; calendar_email: string | null;
  last_error: string | null; invited_at: string | null; connected_at: string | null; last_checked_at: string | null;
  client_profiles: { company_name: string | null } | null;
};
type SyncError = { id: string; created_at: string; source: string; error_reason: string; resolved: boolean | null };

const WEEK_MS = 7 * 86400000;
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");

/** Plain-English reading of a cron expression for the common shapes we use. */
function describeSchedule(s: string): string {
  const m = s.trim().split(/\s+/);
  if (m.length !== 5) return s;
  const [min, hour, , , dow] = m;
  const days = dow === "*" ? "every day" : dow === "1-5" ? "weekdays" : `days ${dow}`;
  if (min.startsWith("*/") && hour === "*") return `every ${min.slice(2)} min`;
  if (hour.startsWith("*/") && /^\d+$/.test(min)) return `every ${hour.slice(2)} h at :${min.padStart(2, "0")}`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return `${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC, ${days}`;
  if (/^\d+$/.test(min) && hour === "*") return `hourly at :${min.padStart(2, "0")}`;
  return s;
}

export function EdgeFunctionsModule() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const cron = useQuery({
    queryKey: ["dev-cron-status"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("dev_cron_status");
      if (error) throw error;
      return (data || []) as CronRow[];
    },
    refetchInterval: 60000,
    retry: false,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ["dev-health-connections"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("calendar_connections")
        .select("id, owner_type, provider, status, calendar_email, last_error, invited_at, connected_at, last_checked_at, client_profiles(company_name)")
        .neq("status", "disconnected")
        .order("invited_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as ConnRow[];
      const cutoff = Date.now() - WEEK_MS;
      return rows.filter((c) => c.status === "error" || (c.status !== "connected" && c.invited_at && new Date(c.invited_at).getTime() < cutoff));
    },
    refetchInterval: 60000,
  });

  const { data: errors = [] } = useQuery({
    queryKey: ["dev-sync-errors"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("sync_errors")
        .select("id, created_at, source, error_reason, resolved")
        .or("resolved.is.null,resolved.eq.false")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as SyncError[];
    },
    refetchInterval: 30000,
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("sync_errors").update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dev-sync-errors"] }); qc.invalidateQueries({ queryKey: ["dev-recent-errors"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const jobs = cron.data ?? [];
  const failing = jobs.filter((j) => j.active && (j.failures_24h > 0 || (j.last_status && j.last_status !== "succeeded")));
  const silent = jobs.filter((j) => j.active && !j.last_start);

  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          { label: "Scheduled jobs", value: cron.isError ? "—" : jobs.filter((j) => j.active).length, caption: cron.isError ? "needs the Health migration" : `${failing.length} failing · ${silent.length} never ran` },
          { label: "Connections to fix", value: connections.length, caption: connections.length ? "error, or invited a week ago and still waiting" : "all connected" },
          { label: "Import errors open", value: errors.length, caption: errors.length ? `latest ${ago(errors[0].created_at)}` : "nothing unresolved" },
        ]}
      />

      <Panel title="Scheduled jobs" meta="Every pg_cron job and its last run, refreshed every minute" aside={<ButtonV2 size="sm" onClick={() => cron.refetch()}>Refresh</ButtonV2>}>
        {cron.isError ? (
          <p className="py-5 text-[12px] text-[var(--dim)]">Cannot read the schedule yet: apply migration 20261015190000 (dev_cron_status) and refresh.</p>
        ) : cron.isLoading ? (
          <p className="py-5 text-[12px] text-[var(--dim)]">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="py-5 text-[12px] text-[var(--dim)]">No jobs scheduled.</p>
        ) : (
          <RowList columns="minmax(220px,1.4fr) 150px 170px 90px" head={["Job", "Runs", "Last run", <span key="f" className="text-right">Fails 24h</span>]}>
            {jobs.map((j) => {
              const bad = j.active && ((j.last_status && j.last_status !== "succeeded") || j.failures_24h > 0);
              return (
                <Row key={j.jobname} health={!j.active ? "none" : bad ? "bad" : j.last_start ? "ok" : "warn"}>
                  <RowName primary={<span className="font-mono text-[12px]">{j.jobname}</span>} secondary={j.target ? `calls ${j.target}` : "runs SQL"} />
                  <div className="font-mono text-[11px] text-[var(--dim)]" title={j.schedule}>{describeSchedule(j.schedule)}{!j.active && " · paused"}</div>
                  <div className="flex items-center gap-[6px]">
                    <Pill variant={!j.last_start ? "default" : j.last_status === "succeeded" ? "ok" : "bad"}>{j.last_status ?? "never"}</Pill>
                    <span className="font-mono text-[10.5px] text-[var(--dim)]" title={j.last_message ?? undefined}>{ago(j.last_start)}</span>
                  </div>
                  <RowNum className={j.failures_24h > 0 ? "text-[var(--bad)]" : "text-[var(--dim)]"}>{j.failures_24h}/{j.runs_24h}</RowNum>
                </Row>
              );
            })}
          </RowList>
        )}
      </Panel>

      <Panel title="Calendar connections needing attention" meta="In error, or invited over a week ago and still not connected" aside={<ButtonV2 size="sm" onClick={() => window.dispatchEvent(new CustomEvent("dev-center:open", { detail: { module: "bookings" } }))}>Open Kronos</ButtonV2>}>
        {connections.length === 0 ? (
          <p className="py-5 text-[12px] text-[var(--dim)]">Nothing waiting. Every invited calendar is connected.</p>
        ) : (
          <RowList columns="minmax(220px,1.4fr) 110px 1fr">
            {connections.map((c) => (
              <Row key={c.id} health={c.status === "error" ? "bad" : "warn"}>
                <RowName primary={c.calendar_email ?? "(no email)"} secondary={`${c.client_profiles?.company_name ?? c.owner_type} · ${c.provider} · invited ${c.invited_at ? format(new Date(c.invited_at), "d MMM") : "—"}`} />
                <div><Pill variant={c.status === "error" ? "bad" : "warn"}>{c.status}</Pill></div>
                <div className="truncate font-mono text-[11px] text-[var(--dim)]" title={c.last_error ?? undefined}>{c.last_error ?? "waiting for them to click the connect link"}</div>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>

      <Panel title="Import errors" meta="Close API, CSV import and consolidation failures still open" aside={<Pill variant={errors.length ? "bad" : "ok"}>{errors.length}</Pill>}>
        {errors.length === 0 ? (
          <p className="py-5 text-[12px] text-[var(--dim)]">No open errors.</p>
        ) : (
          <RowList columns="120px 1fr 110px auto">
            {errors.map((e) => (
              <Row key={e.id} health="bad" className="items-start">
                <div><Pill variant="bad">{e.source.replace("_", " ")}</Pill></div>
                <p className="whitespace-pre-wrap break-words font-mono text-[11px]">{e.error_reason}</p>
                <RowNum className="text-[var(--dim)]">{ago(e.created_at)}</RowNum>
                <ButtonV2 size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate(e.id)}>Resolve</ButtonV2>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
    </div>
  );
}
