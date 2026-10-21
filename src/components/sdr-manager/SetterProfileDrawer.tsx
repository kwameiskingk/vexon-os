// Setter profile drawer, rebuilt 14 Oct 2026 (the owner's admin-level strip).
//
// Opened from Sales › Setters, Operations › Setter Management and the CSM's
// Setter Management. Metrics left the dashboard for the Sheets, so the tabs
// are the things a manager acts on:
//   Stats    the appointments this setter booked, newest first, each marked
//            Kronos or Logged by hand, with the outcome; counts for this
//            week, this month and the commission cycle.
//   Clients  fulfilment setters only (acquisition setters have no clients).
//   Training upcoming sessions booked through Kronos (the Call Review event,
//            which lands on the host's and the setter's calendars) and the
//            logged session history, plus a button to book one.
//   Actions  title and status, as before, minus "Place on PIP" (the PIP
//            page is gone).
// The header carries the Employee Hub facts (start date, base salary,
// per-meeting bonus, birthday) so nobody has to leave the page.
// Gone: KPIs, Targets, Notes (its only purpose was the Current Focus line
// the setter portal no longer shows).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, ButtonV2, DetailHeader, FactsStrip, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarPlus } from "lucide-react";
import { getTitleLabel, getNextTitle, getPreviousTitle, SetterTitle } from "@/lib/setterTitles";
import { differenceInDays, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SetterClientsTab } from "./SetterClientsTab";
import { getCommissionCycleDates } from "@/utils/commissionCycle";

/** The Kronos event managers book training through (Call Review with Marcus). */
const TRAINING_EVENT_SLUG = "call-review-msp-s9x4m";

interface SetterProfileDrawerProps {
  setterId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  /** Render the profile in place (master-detail) instead of in a side sheet. */
  inline?: boolean;
  /** Which bench the caller is showing. Fulfilment gets the Clients tab. */
  department?: "fulfilment" | "acquisition";
}

interface StatRow {
  id: string;
  company_name: string | null;
  prospect_name: string | null;
  meeting_date: string;
  meeting_time: string | null;
  attendance_status: string | null;
  status: string | null;
  is_rebook: boolean | null;
  client_profiles: { company_name: string } | null;
  viaKronos: boolean;
}

interface UpcomingBooking {
  id: string;
  starts_at: string;
  status: string;
  google_meet_link: string | null;
}

const outcomeBadge = (m: StatRow) => {
  if (m.status === "cancelled" || m.attendance_status === "cancelled") return <Pill>Cancelled</Pill>;
  if (m.attendance_status === "rescheduled") return <Pill>Moved</Pill>;
  if (m.attendance_status === "sat") return <Pill variant="ok">Sat</Pill>;
  if (m.attendance_status === "no_show") return <Pill variant="bad">No show</Pill>;
  return <Pill variant="info">Booked</Pill>;
};

const money = (n: number | null | undefined, currency: string | null | undefined) => {
  if (n === null || n === undefined) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "ZAR" ? "R" : currency === "EUR" ? "€" : "$";
  return `${symbol}${Number(n).toLocaleString()}`;
};

const SetterProfileDrawer = ({ setterId, open, onClose, onUpdate, department, inline = false }: SetterProfileDrawerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: setter, isLoading } = useQuery({
    queryKey: ["setter-profile-detail", setterId],
    enabled: !!setterId && open,
    queryFn: async () => {
      if (!setterId) return null;
      const { data: profile, error } = await supabase
        .from("setters_profiles")
        .select("*")
        .eq("id", setterId)
        .single();
      if (error) throw error;

      const [personRes, meetingsRes, sessionsRes, bookingsRes] = await Promise.all([
        profile.user_id
          ? supabase.from("profiles").select("birthday, start_date, avatar_url").eq("id", profile.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
        profile.user_id
          ? supabase
              .from("meetings")
              .select("id, company_name, prospect_name, meeting_date, meeting_time, attendance_status, status, is_rebook, client_profiles!meetings_client_profile_id_fkey(company_name)")
              .or(`setter_id.eq.${profile.user_id},logged_by_setter_id.eq.${profile.user_id}`)
              .order("meeting_date", { ascending: false })
              .order("meeting_time", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [] }),
        supabase
          .from("coaching_sessions")
          .select("id, session_type, custom_session_label, session_date, session_time, status, improvements, fathom_link, call_recording_link")
          .eq("setter_profile_id", setterId)
          .order("session_date", { ascending: false })
          .limit(10),
        profile.email
          ? supabase
              .from("bookings")
              .select("id, starts_at, status, google_meet_link, booking_event_types!inner(slug)")
              .eq("prospect_email", profile.email)
              .eq("booking_event_types.slug", TRAINING_EVENT_SLUG)
              .in("status", ["confirmed", "pending"])
              .gte("starts_at", new Date().toISOString())
              .order("starts_at", { ascending: true })
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

      const meetings = ((meetingsRes.data || []) as unknown as Omit<StatRow, "viaKronos">[]);
      // A meeting booked through Kronos has a bookings row pointing at it.
      let kronosIds = new Set<string>();
      if (meetings.length > 0) {
        const { data: linked } = await supabase
          .from("bookings")
          .select("meeting_id")
          .in("meeting_id", meetings.map((m) => m.id));
        kronosIds = new Set((linked || []).map((b) => b.meeting_id).filter(Boolean) as string[]);
      }

      const person = (personRes as { data: { birthday: string | null; start_date: string | null; avatar_url: string | null } | null }).data;
      const startDate = profile.start_date || person?.start_date || null;
      return {
        ...profile,
        birthday: person?.birthday ?? null,
        startDate,
        tenure: startDate ? differenceInDays(new Date(), parseISO(startDate)) : profile.created_at ? differenceInDays(new Date(), new Date(profile.created_at)) : 0,
        stats: meetings.map((m) => ({ ...m, viaKronos: kronosIds.has(m.id) })) as StatRow[],
        sessions: sessionsRes.data || [],
        upcoming: ((bookingsRes.data || []) as unknown as UpcomingBooking[]),
      };
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: "active" | "trainee") => {
      const { error } = await supabase
        .from("setters_profiles")
        .update({ status: newStatus, status_changed_at: new Date().toISOString(), status_changed_by: user?.id })
        .eq("id", setterId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["setter-profile-detail"] });
      onUpdate();
    },
    onError: (error) => {
      toast.error("Failed to update status");
      console.error(error);
    },
  });

  const updateTitleMutation = useMutation({
    mutationFn: async (newTitle: SetterTitle) => {
      const { error } = await supabase.from("setters_profiles").update({ title: newTitle }).eq("id", setterId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Title updated");
      queryClient.invalidateQueries({ queryKey: ["setter-profile-detail"] });
      queryClient.invalidateQueries({ queryKey: ["sdr-manager-setters-list"] });
      onUpdate();
    },
    onError: (error) => {
      toast.error("Failed to update title");
      console.error(error);
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Pill variant="ok">Active</Pill>;
      case "trainee":
        return <Pill variant="info">Trainee</Pill>;
      default:
        return <Pill>{status}</Pill>;
    }
  };

  const showClients = (department ?? setter?.department) === "fulfilment";
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const cycle = getCommissionCycleDates();
  const cycleStart = format(cycle.start, "yyyy-MM-dd");
  const cycleEnd = format(cycle.end, "yyyy-MM-dd");
  const live = (m: StatRow) => !m.is_rebook && m.status !== "cancelled" && m.attendance_status !== "cancelled" && m.attendance_status !== "rescheduled";
  const stats = setter?.stats ?? [];
  const inRange = (a: string, b: string) => stats.filter((m) => live(m) && m.meeting_date >= a && m.meeting_date <= b);
  const counts = [
    { label: "This week", rows: inRange(weekStart, weekEnd) },
    { label: "This month", rows: inRange(monthStart, today > format(new Date(), "yyyy-MM-dd") ? today : "9999-12-31") },
    { label: `Cycle ${format(cycle.start, "d MMM")}–${format(cycle.end, "d MMM")}`, rows: inRange(cycleStart, cycleEnd) },
  ];

  const bookTraining = () => {
    if (!setter) return;
    const params = new URLSearchParams({ lite: "1", name: setter.full_name || "", email: setter.email || "" });
    window.open(`/bookings/${TRAINING_EVENT_SLUG}?${params.toString()}`, "_blank", "noopener");
  };

  const body = (
    <>
        {isLoading ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : setter ? (
          <>
            <DetailHeader
              avatar={<Avatar name={setter.full_name || setter.email || "?"} size={52} ring />}
              name={inline ? setter.full_name : <SheetTitle className="font-head text-[22px] font-medium tracking-[-0.02em]">{setter.full_name}</SheetTitle>}
              email={setter.email}
              pills={<>
                {statusBadge(setter.status || "active")}
                <Pill variant="info">{getTitleLabel(setter.title)}</Pill>
                <Pill className="capitalize">{setter.department}</Pill>
              </>}
            />
            {/* Employee Hub facts, so nobody has to go there */}
            <FactsStrip
              facts={[
                { label: "Started", value: <>{setter.startDate ? format(parseISO(setter.startDate), "d MMM yyyy") : "—"}{setter.tenure ? <span className="text-[var(--dim)]"> · {setter.tenure}d</span> : null}</> },
                { label: "Base salary", value: money(setter.base_salary, setter.currency) },
                { label: "Per sat meeting", value: `$${setter.per_meeting_bonus ?? 50}` },
                { label: "Birthday", value: setter.birthday ? format(parseISO(setter.birthday), "d MMM") : "—" },
              ]}
            />

            <Tabs defaultValue="stats" className="mt-4">
              <TabsList className={`grid w-full ${showClients ? "grid-cols-4" : "grid-cols-3"}`}>
                <TabsTrigger value="stats">Stats</TabsTrigger>
                {showClients && <TabsTrigger value="clients">Clients</TabsTrigger>}
                <TabsTrigger value="training">Training</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
              </TabsList>

              <TabsContent value="stats" className="space-y-5 mt-4">
                <StatStrip
                  stats={counts.map((c) => ({ label: c.label, value: c.rows.length, caption: `${c.rows.filter((m) => m.attendance_status === "sat").length} sat` }))}
                />
                <Panel title="Appointments booked" meta="Newest first" aside={<Pill>{stats.length}</Pill>}>
                  {stats.length === 0 ? (
                    <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No appointments yet.</p>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto">
                      <RowList columns="150px 1fr auto">
                        {stats.slice(0, 100).map((m) => (
                          <Row key={m.id}>
                            <RowNum className="text-[var(--dim)]">{format(parseISO(m.meeting_date), "EEE d MMM")}{m.meeting_time ? ` ${m.meeting_time.slice(0, 5)}` : ""}</RowNum>
                            <RowName
                              primary={<>{m.prospect_name || "Unnamed"} <span className="font-normal text-[var(--dim)]">· {m.client_profiles?.company_name || m.company_name || "—"}</span></>}
                              secondary={`${m.viaKronos ? "Kronos" : "Logged by hand"}${m.is_rebook ? " · rebook" : ""}`}
                            />
                            <div className="text-right">{outcomeBadge(m)}</div>
                          </Row>
                        ))}
                      </RowList>
                    </div>
                  )}
                </Panel>
              </TabsContent>

              {showClients && (
                <TabsContent value="clients" className="mt-4">
                  <SetterClientsTab setterId={setterId!} department="fulfilment" />
                </TabsContent>
              )}

              <TabsContent value="training" className="space-y-4 mt-4">
                <Button size="sm" className="gap-1.5" onClick={bookTraining}>
                  <CalendarPlus className="h-4 w-4" />
                  Book a training session
                </Button>
                <p className="text-xs text-muted-foreground -mt-2">
                  Books through Kronos, so it lands on the host's calendar and {setter.full_name?.split(" ")[0] || "the setter"}'s with a Meet link.
                </p>
                <Panel title="Upcoming" aside={<Pill>{setter.upcoming.length}</Pill>}>
                  {setter.upcoming.length === 0 ? (
                    <p className="py-[18px] text-center text-[12px] text-[var(--dim)]">Nothing booked.</p>
                  ) : (
                    <RowList columns="1fr auto">
                      {setter.upcoming.map((b) => (
                        <Row key={b.id}>
                          <RowNum className="text-left">{format(new Date(b.starts_at), "EEE d MMM, HH:mm")}</RowNum>
                          <div className="flex items-center gap-[6px]">
                            <Pill className="capitalize">{b.status}</Pill>
                            {b.google_meet_link && (
                              <a href={b.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-[var(--accent)]">Meet link</a>
                            )}
                          </div>
                        </Row>
                      ))}
                    </RowList>
                  )}
                </Panel>
                <Panel title="Session history" aside={<Pill>{setter.sessions.length}</Pill>}>
                  {setter.sessions.length === 0 ? (
                    <p className="py-[18px] text-center text-[12px] text-[var(--dim)]">No sessions logged yet.</p>
                  ) : (
                    <RowList columns="110px 1fr auto">
                      {setter.sessions.map((s) => (
                        <Row key={s.id} className="items-start">
                          <RowNum className="text-[var(--dim)]">{format(parseISO(s.session_date), "d MMM")}{s.session_time ? ` ${String(s.session_time).slice(0, 5)}` : ""}</RowNum>
                          <RowName primary={<span className="capitalize">{s.custom_session_label || s.session_type?.replace(/_/g, " ")}</span>} secondary={s.improvements || undefined} />
                          {(s.fathom_link || s.call_recording_link) ? (
                            <a href={s.fathom_link || s.call_recording_link || "#"} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-[var(--accent)]">Recording</a>
                          ) : <span />}
                        </Row>
                      ))}
                    </RowList>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="actions" className="space-y-5 mt-4">
                <Panel title="Title" meta="Trainee $25 · SDR $50 · Lead SDR $75 · Senior SDR $100 per sat meeting" aside={<Pill variant="info">{getTitleLabel(setter.title)}</Pill>}>
                  <div className="flex flex-wrap gap-[6px] pt-3">
                    {getNextTitle((setter.title || "sdr") as SetterTitle) && (
                      <ButtonV2
                        size="sm"
                        variant="primary"
                        onClick={() => { const next = getNextTitle((setter.title || "sdr") as SetterTitle); if (next) updateTitleMutation.mutate(next); }}
                        disabled={updateTitleMutation.isPending}
                      >
                        Promote to {getTitleLabel(getNextTitle((setter.title || "sdr") as SetterTitle)!)}
                      </ButtonV2>
                    )}
                    {getPreviousTitle((setter.title || "sdr") as SetterTitle) && (
                      <ButtonV2
                        size="sm"
                        onClick={() => { const prev = getPreviousTitle((setter.title || "sdr") as SetterTitle); if (prev) updateTitleMutation.mutate(prev); }}
                        disabled={updateTitleMutation.isPending}
                      >
                        Demote to {getTitleLabel(getPreviousTitle((setter.title || "sdr") as SetterTitle)!)}
                      </ButtonV2>
                    )}
                  </div>
                </Panel>

                <Panel title="Status" aside={statusBadge(setter.status || "active")}>
                  <div className="flex flex-wrap gap-[6px] pt-3">
                    {setter.status !== "trainee" && (
                      <ButtonV2 size="sm" onClick={() => updateStatusMutation.mutate("trainee")} disabled={updateStatusMutation.isPending}>
                        Mark as trainee
                      </ButtonV2>
                    )}
                    {setter.status !== "active" && (
                      <ButtonV2 size="sm" variant="primary" onClick={() => updateStatusMutation.mutate("active")} disabled={updateStatusMutation.isPending}>
                        Return to active
                      </ButtonV2>
                    )}
                  </div>
                </Panel>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="pt-6 text-center">
            <p className="text-muted-foreground">Setter not found</p>
          </div>
        )}
    </>
  );

  if (inline) {
    return <div className="min-w-0">{body}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {body}
      </SheetContent>
    </Sheet>
  );
};

export default SetterProfileDrawer;
