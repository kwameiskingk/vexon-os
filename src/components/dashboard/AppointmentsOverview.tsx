// Appointments-first Overview for the Sales and Operations departments
// (14 Oct 2026, the owner). Metrics left the dashboard for the Sheets, so the
// department Overview shows the one thing a manager acts on before 10am:
// the appointments. Today's calls first, with the confirmation questions
// answered in place (the same rule and the same columns as the setter
// Overview and the Needs Confirmation tab), then the rest of the week by
// day. Every row names the setter who booked it. Opening a row goes to the
// department's Appointments page, where moving, cancelling and scoring live.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endOfWeek, format, parseISO } from "date-fns";
import { ButtonV2, Panel, Pill, StatStrip, Timeline } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUKDateString } from "@/utils/timezoneUtils";

type Department = "acquisition" | "fulfilment";
type ConfirmField = "client_confirmed_attendance" | "prospect_watched_video";

interface Row {
  id: string;
  company_name: string | null;
  prospect_name: string | null;
  meeting_date: string;
  meeting_time: string | null;
  status: string | null;
  attendance_status: string | null;
  is_rebook: boolean | null;
  client_confirmed_attendance: boolean | null;
  prospect_watched_video: boolean | null;
  setter_id: string | null;
  logged_by_setter_id: string | null;
  lead_type: string | null;
  client_profiles: { id: string; company_name: string } | null;
}

interface Props {
  department: Department;
  /** Where a row opens: the department's Appointments page. */
  appointmentsPath: string;
}

/** Live meetings only: no rebooks, nothing cancelled or moved. Same rule as Appointments. */
const isLive = (r: Row) =>
  !r.is_rebook &&
  r.status !== "cancelled" &&
  r.attendance_status !== "cancelled" &&
  r.attendance_status !== "rescheduled";

const timeLabel = (t: string | null) => (t ? t.slice(0, 5) : "");

export function AppointmentsOverview({ department, appointmentsPath }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [setterNames, setSetterNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const isAcquisition = department === "acquisition";
  const today = getUKDateString();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const sunday = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
        const { data, error } = await supabase
          .from("meetings")
          .select(
            "id, company_name, prospect_name, meeting_date, meeting_time, status, attendance_status, is_rebook, client_confirmed_attendance, prospect_watched_video, setter_id, logged_by_setter_id, lead_type, client_profiles!meetings_client_profile_id_fkey(id, company_name)",
          )
          .eq("department", department)
          .gte("meeting_date", today)
          .lte("meeting_date", sunday)
          .order("meeting_date", { ascending: true })
          .order("meeting_time", { ascending: true })
          .limit(500);
        if (error) throw error;
        const live = ((data || []) as unknown as Row[]).filter(isLive);
        const setterIds = [...new Set(live.map((r) => r.setter_id ?? r.logged_by_setter_id).filter(Boolean))] as string[];
        let names: Record<string, string> = {};
        if (setterIds.length > 0) {
          const { data: setters } = await supabase
            .from("setters_profiles")
            .select("user_id, full_name")
            .in("user_id", setterIds);
          names = Object.fromEntries((setters || []).map((s) => [s.user_id, s.full_name]));
        }
        if (!cancelled) {
          setRows(live);
          setSetterNames(names);
        }
      } catch (e) {
        if (!cancelled) toast({ title: "Could not load appointments", description: (e as Error).message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department]);

  const needsAnswer = (m: Row) =>
    m.client_confirmed_attendance === null || (isAcquisition && m.prospect_watched_video === null);

  const todays = useMemo(() => {
    const list = rows.filter((r) => r.meeting_date === today);
    // Calls still to make sit at the top.
    return list.sort((a, b) => Number(!needsAnswer(a)) - Number(!needsAnswer(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today, isAcquisition]);

  const week = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.meeting_date <= today) continue;
      if (!byDay.has(r.meeting_date)) byDay.set(r.meeting_date, []);
      byDay.get(r.meeting_date)!.push(r);
    }
    return [...byDay.entries()];
  }, [rows, today]);

  const toConfirm = todays.filter(needsAnswer).length;

  const confirm = async (id: string, field: ConfirmField, value: boolean) => {
    setSaving(`${id}:${field}`);
    try {
      const { error } = await supabase.from("meetings").update({ [field]: value }).eq("id", id);
      if (error) {
        toast({ title: "Could not save", description: error.message, variant: "destructive" });
        return;
      }
      setRows((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
      toast({ title: "Saved" });
    } finally {
      setSaving(null);
    }
  };

  const setterOf = (m: Row) => {
    const id = m.setter_id ?? m.logged_by_setter_id;
    return (id && setterNames[id]) || "Unknown setter";
  };
  const whoWith = (m: Row) =>
    isAcquisition ? m.company_name || "No company" : m.client_profiles?.company_name || m.company_name || "No client";
  const kindOf = (m: Row) => {
    if (!isAcquisition) return null;
    const t = (m.lead_type || "").toLowerCase();
    return t.includes("follow") || t.includes("pitch") ? "Follow-up" : "Discovery";
  };

  const toItem = (m: Row, withActions: boolean) => ({
    id: m.id,
    time: timeLabel(m.meeting_time),
    primary: <>{m.prospect_name || "Unnamed"} <span className="font-normal text-[var(--dim)]">· {whoWith(m)}</span></>,
    secondary: `${kindOf(m) ? `${kindOf(m)} · ` : ""}booked by ${setterOf(m)}`,
    focus: withActions && needsAnswer(m),
    onClick: () => navigate(appointmentsPath),
    aside: withActions ? (
      <div className="flex flex-col items-end gap-1">
        {m.client_confirmed_attendance === null ? (
          <div className="flex gap-[5px]">
            <ButtonV2 size="sm" disabled={saving === `${m.id}:client_confirmed_attendance`} onClick={(e) => { e.stopPropagation(); confirm(m.id, "client_confirmed_attendance", false); }}>No</ButtonV2>
            <ButtonV2 size="sm" variant="primary" disabled={saving === `${m.id}:client_confirmed_attendance`} onClick={(e) => { e.stopPropagation(); confirm(m.id, "client_confirmed_attendance", true); }}>Confirmed</ButtonV2>
          </div>
        ) : (
          <Pill variant={m.client_confirmed_attendance ? "ok" : "default"}>{m.client_confirmed_attendance ? "Confirmed" : "Not confirmed"}</Pill>
        )}
        {isAcquisition && (
          m.prospect_watched_video === null ? (
            <div className="flex items-center gap-[6px] text-[11px] text-[var(--dim)]">
              Watched the video?
              <ButtonV2 size="sm" disabled={saving === `${m.id}:prospect_watched_video`} onClick={(e) => { e.stopPropagation(); confirm(m.id, "prospect_watched_video", false); }}>No</ButtonV2>
              <ButtonV2 size="sm" disabled={saving === `${m.id}:prospect_watched_video`} onClick={(e) => { e.stopPropagation(); confirm(m.id, "prospect_watched_video", true); }}>Yes</ButtonV2>
            </div>
          ) : (
            <Pill variant={m.prospect_watched_video ? "ok" : "default"}>{m.prospect_watched_video ? "Watched video" : "Not watched"}</Pill>
          )
        )}
      </div>
    ) : (
      <Pill variant="info">Booked</Pill>
    ),
  });

  const weekGroups = week.map(([day, list]) => ({
    label: format(parseISO(day), "EEE"),
    day: format(parseISO(day), "d MMM"),
    items: list.map((m) => toItem(m, false)),
  }));

  const skeleton = (
    <div className="mt-3 space-y-2">
      <div className="h-5 w-full animate-pulse rounded bg-[var(--surf2)]" />
      <div className="h-5 w-3/4 animate-pulse rounded bg-[var(--surf2)]" />
      <div className="h-5 w-1/2 animate-pulse rounded bg-[var(--surf2)]" />
    </div>
  );

  const restCount = week.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          { label: "Today", value: loading ? "–" : todays.length, caption: isAcquisition ? "discovery and follow-up calls" : "client meetings" },
          { label: "To confirm", value: loading ? "–" : toConfirm, caption: todays.find(needsAnswer) ? `${todays.find(needsAnswer)!.prospect_name}, ${timeLabel(todays.find(needsAnswer)!.meeting_time)}` : "Nothing waiting" },
          { label: "Rest of this week", value: loading ? "–" : restCount, caption: "After today, to Sunday" },
        ]}
      />

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Today"
          meta={format(new Date(), "EEE d MMM")}
          aside={!loading && (toConfirm > 0
            ? <Pill variant="warn">{toConfirm} to confirm</Pill>
            : <Pill variant={todays.length > 0 ? "ok" : "default"}>{todays.length > 0 ? "All confirmed" : "Nothing today"}</Pill>)}
        >
          {loading ? skeleton : (
            <Timeline
              groups={[{ label: "", items: todays.map((m) => toItem(m, true)) }]}
              empty={`No ${isAcquisition ? "calls" : "meetings"} booked for today.`}
            />
          )}
          <button type="button" className="mt-2 pt-2 text-left text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate(appointmentsPath)}>
            Open Appointments →
          </button>
        </Panel>

        <Panel title="Rest of this week" meta="After today, to Sunday" aside={!loading && <Pill>{restCount} booked</Pill>}>
          {loading ? skeleton : <Timeline groups={weekGroups} empty="Nothing else booked this week." />}
        </Panel>
      </div>
    </div>
  );
}
