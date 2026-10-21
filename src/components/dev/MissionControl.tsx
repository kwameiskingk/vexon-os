// Dev Centre › Overview (rebuilt 15 Oct 2026 on the build log). Real probes
// for database, auth and storage (a timed request each, not a hard-coded
// "online"), this month's claim per client straight from devBuildLog, and
// the recent activity feed.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { CLIENT_LABEL, isLive, money, monthReport, round1, savedPerWeek, thisMonth, normaliseBuild, type BuildRow, type HoursRow } from "@/lib/devBuildLog";

const sb = supabase as unknown as SupabaseClient;

type Probe = { ms: number | null; ok: boolean; note?: string };

async function timed(run: () => PromiseLike<unknown>): Promise<Probe> {
  const start = performance.now();
  try {
    const res = (await run()) as { error?: unknown } | undefined;
    const ms = Math.round(performance.now() - start);
    if (res && typeof res === "object" && res.error) return { ms, ok: false, note: String((res.error as { message?: string }).message ?? res.error) };
    return { ms, ok: true };
  } catch (e) {
    return { ms: Math.round(performance.now() - start), ok: false, note: e instanceof Error ? e.message : String(e) };
  }
}

const tone = (p?: Probe) => (!p ? "default" : !p.ok ? "bad" : (p.ms ?? 0) > 1500 ? "warn" : "ok");
const label = (p?: Probe) => (!p ? "—" : !p.ok ? "down" : `${p.ms} ms`);

export function MissionControl() {
  /* ---------------- probes ---------------- */
  const { data: db } = useQuery({ queryKey: ["dev-probe-db"], queryFn: () => timed(() => sb.from("system_settings").select("id").limit(1)), refetchInterval: 15000 });
  const { data: auth } = useQuery({ queryKey: ["dev-probe-auth"], queryFn: () => timed(() => sb.auth.getUser()), refetchInterval: 30000 });
  const { data: storage } = useQuery({ queryKey: ["dev-probe-storage"], queryFn: () => timed(() => sb.storage.listBuckets()), refetchInterval: 30000 });

  const { data: importErrors } = useQuery({
    queryKey: ["dev-recent-errors"],
    queryFn: async () => { const { count } = await sb.from("sync_errors").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 86400000).toISOString()); return count ?? 0; },
    refetchInterval: 60000,
  });
  const { data: badConnections } = useQuery({
    queryKey: ["dev-bad-connections"],
    queryFn: async () => { const { count } = await sb.from("calendar_connections").select("id", { count: "exact", head: true }).eq("status", "error"); return count ?? 0; },
    refetchInterval: 60000,
  });
  const { data: openTickets } = useQuery({
    queryKey: ["dev-ticket-stats"],
    queryFn: async () => { const { data } = await sb.from("dev_tickets").select("status"); return (data || []).filter((t) => !["resolved", "closed"].includes(t.status)).length; },
    refetchInterval: 30000,
  });

  /* ---------------- build log ---------------- */
  const { data: builds = [] } = useQuery({
    queryKey: ["dev-builds"],
    queryFn: async () => { const { data, error } = await sb.from("dev_projects").select("*"); if (error) throw error; return ((data || []) as (Partial<BuildRow> & { id: string; title: string })[]).map(normaliseBuild); },
    refetchInterval: 60000,
  });
  const { data: hours = [] } = useQuery({
    queryKey: ["dev-build-hours"],
    queryFn: async () => { const { data, error } = await sb.from("dev_project_hours").select("*"); if (error) throw error; return (data || []) as HoursRow[]; },
    refetchInterval: 60000,
  });
  const month = thisMonth();
  const vexon = useMemo(() => monthReport("vexon", month, builds, hours), [month, builds, hours]);
  const northgate = useMemo(() => monthReport("northgate", month, builds, hours), [month, builds, hours]);
  const live = builds.filter(isLive);
  const weekSaved = live.reduce((s, b) => s + hours.filter((h) => h.project_id === b.id).reduce((t, h) => t + savedPerWeek(h), 0), 0);
  const building = builds.filter((b) => !isLive(b) && b.status !== "archived" && b.status !== "idea");

  /* ---------------- activity ---------------- */
  const { data: recentTickets = [] } = useQuery({
    queryKey: ["dev-mc-tickets-feed"],
    queryFn: async () => { const { data } = await sb.from("dev_tickets").select("id, title, status, priority, created_at, reporter_name").order("created_at", { ascending: false }).limit(8); return data || []; },
    refetchInterval: 30000,
  });
  const { data: recentNotes = [] } = useQuery({
    queryKey: ["dev-mc-project-notes"],
    queryFn: async () => { const { data } = await sb.from("dev_project_notes").select("id, body, author_name, created_at, dev_projects(title)").order("created_at", { ascending: false }).limit(8); return data || []; },
    refetchInterval: 30000,
  });

  type Item = { key: string; kind: string; tone: "ok" | "info" | "warn" | "default"; ts: string; title: string; sub: string };
  const feed: Item[] = [
    ...recentTickets.map((t) => ({ key: `t${t.id}`, kind: "Ticket", tone: "info" as const, ts: t.created_at, title: t.title, sub: `${t.reporter_name || "—"} · ${t.priority} · ${t.status}` })),
    ...recentNotes.map((n) => { const title = (n as { dev_projects?: { title?: string } | null }).dev_projects?.title; return { key: `n${n.id}`, kind: "Log", tone: "ok" as const, ts: n.created_at, title: title ? `${title}: ${truncate(n.body, 70)}` : truncate(n.body, 90), sub: n.author_name || "dev" }; }),
    ...builds.filter((b) => b.rolled_out_date).sort((a, b) => (b.rolled_out_date! > a.rolled_out_date! ? 1 : -1)).slice(0, 5).map((b) => ({ key: `b${b.id}`, kind: "Live", tone: "ok" as const, ts: `${b.rolled_out_date}T12:00:00Z`, title: b.title, sub: `${CLIENT_LABEL[b.client]}${b.replaced ? ` · replaced ${b.replaced}` : ""}` })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10);

  const pulse = [
    { label: "Database", value: label(db), tone: tone(db), note: db?.note },
    { label: "Auth", value: label(auth), tone: tone(auth), note: auth?.note },
    { label: "Storage", value: label(storage), tone: tone(storage), note: storage?.note },
    { label: "Import errors 24h", value: String(importErrors ?? "—"), tone: (importErrors ?? 0) > 10 ? "bad" : (importErrors ?? 0) > 0 ? "warn" : "ok" },
    { label: "Calendar connections", value: badConnections == null ? "—" : badConnections === 0 ? "all fine" : `${badConnections} need attention`, tone: (badConnections ?? 0) > 0 ? "warn" : "ok" },
    { label: "Tickets open", value: String(openTickets ?? "—"), tone: (openTickets ?? 0) > 0 ? "info" : "ok" },
  ] as const;

  return (
    <div className="space-y-6">
      <StatStrip
        hero
        stats={[
          { label: `Meridian · ${format(new Date(`${month}-01T12:00:00`), "MMMM")}`, value: money(vexon.total), caption: `${round1(vexon.hoursMonth)} hrs saved · ${money(vexon.fees)} fees` },
          { label: `Northgate Recruitment · ${format(new Date(`${month}-01T12:00:00`), "MMMM")}`, value: money(northgate.total, northgate.currency), caption: `${northgate.lines.filter((l) => l.fee > 0).length} fee${northgate.lines.filter((l) => l.fee > 0).length === 1 ? "" : "s"} this month` },
          { label: "Saving every week", value: `${round1(weekSaved)} h`, caption: `${live.length} build${live.length === 1 ? "" : "s"} live` },
          { label: "In progress", value: building.length, caption: building[0]?.title ?? "Nothing on the bench" },
        ]}
      />

      <Panel title="Platform pulse" meta="A timed request each, refreshed every 15 to 30 seconds">
        <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 xl:grid-cols-6">
          {pulse.map((p) => (
            <div key={p.label} className="rounded-[8px] bg-[var(--surf2)] px-3 py-[10px]">
              <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--dim)]">{p.label}</p>
              <div className="mt-1 flex items-center gap-2"><Pill variant={p.tone}>{p.value}</Pill></div>
              {"note" in p && p.note && <p className="mt-1 truncate font-mono text-[10px] text-[var(--bad)]" title={p.note}>{p.note}</p>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Recent activity" meta="Tickets, log entries and go-lives">
          {feed.length === 0 ? <p className="py-5 text-[12px] text-[var(--dim)]">Nothing yet.</p> : (
            <RowList columns="72px 1fr 90px" className="mt-2">
              {feed.map((a) => (
                <Row key={a.key}>
                  <div><Pill variant={a.tone}>{a.kind}</Pill></div>
                  <RowName primary={<span className="font-normal">{a.title}</span>} secondary={a.sub} />
                  <RowNum className="text-[var(--dim)]">{formatDistanceToNow(new Date(a.ts), { addSuffix: true })}</RowNum>
                </Row>
              ))}
            </RowList>
          )}
        </Panel>
        <Panel title="Live builds" meta="By client, most recent first" aside={<Pill>{live.length}</Pill>}>
          {live.length === 0 ? <p className="py-5 text-[12px] text-[var(--dim)]">Nothing live yet. Log the first build.</p> : (
            <RowList columns="1fr 70px" className="mt-2">
              {[...live].sort((a, b) => ((b.rolled_out_date ?? "") > (a.rolled_out_date ?? "") ? 1 : -1)).slice(0, 12).map((b) => {
                const wk = hours.filter((h) => h.project_id === b.id).reduce((t, h) => t + savedPerWeek(h), 0);
                return (
                  <Row key={b.id}>
                    <RowName primary={b.title} secondary={`${CLIENT_LABEL[b.client]}${b.rolled_out_date ? ` · ${format(new Date(b.rolled_out_date), "d MMM")}` : ""}`} />
                    <RowNum className="text-[var(--dim)]">{wk > 0 ? `${round1(wk)} h/wk` : b.fee_amount ? money(Number(b.fee_amount), b.fee_currency) : "—"}</RowNum>
                  </Row>
                );
              })}
            </RowList>
          )}
        </Panel>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
