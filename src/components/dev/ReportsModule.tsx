// Reports (15 Oct 2026): the month's commission claim per client, straight
// from the build log. Meridian = hours saved × $10 + tool fees; Northgate Recruitment =
// the fees entered on each build (no fixed terms). CSV export is the claim.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ButtonV2, Chip, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import {
  BILLING_LABEL, CLIENT_LABEL, HOURLY_RATE_USD, isLive, money, monthReport, reportCsv, round1, thisMonth,
  normaliseBuild, type BuildClient, type BuildRow, type HoursRow,
} from "@/lib/devBuildLog";

const sb = supabase as unknown as SupabaseClient;

export function ReportsModule() {
  const [client, setClient] = useState<BuildClient>("vexon");
  const [month, setMonth] = useState(thisMonth());
  const { data: builds = [] } = useQuery({
    queryKey: ["dev-builds"],
    queryFn: async () => { const { data, error } = await sb.from("dev_projects").select("*"); if (error) throw error; return ((data || []) as (Partial<BuildRow> & { id: string; title: string })[]).map(normaliseBuild); },
  });
  const { data: hours = [] } = useQuery({
    queryKey: ["dev-build-hours"],
    queryFn: async () => { const { data, error } = await sb.from("dev_project_hours").select("*"); if (error) throw error; return (data || []) as HoursRow[]; },
  });

  const report = useMemo(() => monthReport(client, month, builds, hours), [client, month, builds, hours]);
  const owedInterviews = builds.filter((b) => b.client === client && isLive(b) && (b.billing_model === "hours" || b.billing_model === "both") && !hours.some((h) => h.project_id === b.id));
  const monthLabel = format(new Date(`${month}-01T12:00:00`), "MMMM yyyy");

  const download = () => {
    const blob = new Blob([reportCsv(report)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${CLIENT_LABEL[client]}-commission-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-[6px]">
        {(Object.keys(CLIENT_LABEL) as BuildClient[]).map((c) => <Chip key={c} selected={client === c} onClick={() => setClient(c)}>{CLIENT_LABEL[c]}</Chip>)}
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        <input type="month" className="dc-input w-[160px]" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <span className="ml-auto"><ButtonV2 size="sm" variant="primary" onClick={download} disabled={report.lines.length === 0}>Download CSV</ButtonV2></span>
      </div>

      <StatStrip
        hero
        stats={[
          { label: `${CLIENT_LABEL[client]} · ${monthLabel}`, value: money(report.total, report.currency), caption: client === "vexon" ? `Hours × $${HOURLY_RATE_USD} + tool fees` : "Fees entered on each build" },
          { label: "Hours saved", value: round1(report.hoursMonth), caption: client === "vexon" ? money(report.hoursValue) : "Recorded, not priced" },
          { label: "Tool fees", value: money(report.fees, report.currency), caption: `${report.lines.filter((l) => l.fee > 0).length} charged this month` },
          { label: "Builds live", value: report.lines.filter((l) => isLive(l.build)).length, caption: `${owedInterviews.length} still need a baseline interview` },
        ]}
      />

      <Panel title="Lines" meta="Every build live by the end of the month, and every fee charged in it" aside={<Pill>{report.lines.length}</Pill>}>
        {report.lines.length === 0 ? (
          <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">Nothing to claim for {CLIENT_LABEL[client]} in {monthLabel}.</p>
        ) : (
          <RowList columns="minmax(220px,1.6fr) 110px 110px 110px 110px 110px" head={["Build", "Billing", <span key="h" className="text-right">Hours / mo</span>, <span key="v" className="text-right">Hours value</span>, <span key="f" className="text-right">Fee</span>, <span key="t" className="text-right">Total</span>]}>
            {report.lines.map((l) => (
              <Row key={l.build.id}>
                <RowName primary={l.build.title} secondary={`${l.build.replaced ? `replaced ${l.build.replaced} · ` : ""}${l.build.rolled_out_date ? `live ${format(new Date(l.build.rolled_out_date), "d MMM yyyy")}` : isLive(l.build) ? "live, date not set" : "not live"}`} />
                <div><Pill variant={l.build.billing_model === "unbilled" ? "default" : "info"}>{BILLING_LABEL[l.build.billing_model]}</Pill></div>
                <RowNum>{round1(l.hoursMonth)}</RowNum>
                <RowNum>{l.hoursValue ? money(l.hoursValue) : "—"}</RowNum>
                <RowNum>{l.fee ? money(l.fee, l.build.fee_currency) : "—"}</RowNum>
                <RowNum className="font-semibold">{money(l.total, report.currency)}</RowNum>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>

      {owedInterviews.length > 0 && (
        <Panel title="Baseline interviews owed" meta="Live builds billed on hours with no role line yet" aside={<Pill variant="warn">{owedInterviews.length}</Pill>}>
          <RowList columns="1fr auto">
            {owedInterviews.map((b) => (
              <Row key={b.id} health="warn">
                <RowName primary={b.title} secondary={b.owner ? `Ask ${b.owner}` : "Ask whoever uses it day to day"} />
                <RowNum className="text-[var(--dim)]">{b.rolled_out_date ? format(new Date(b.rolled_out_date), "d MMM") : "—"}</RowNum>
              </Row>
            ))}
          </RowList>
        </Panel>
      )}
    </div>
  );
}
