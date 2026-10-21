import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Chip, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { UpdateMeetingStatusModal } from "@/components/meetings/UpdateMeetingStatusModal";
import { MeetingDetailDrawer } from "@/components/meetings/MeetingDetailDrawer";
import { ClientAssignmentModal } from "@/components/admin/ClientAssignmentModal";
import { ScoreMeetingDrawer, type ScorableMeeting } from "@/components/meetings/ScoreMeetingDrawer";
import { MeetingScoreCard } from "@/components/meetings/MeetingScoreCard";
import { scoreColorClasses, type MeetingScore } from "@/lib/meetingScores";
import { fetchTestSetterIds, isTestSetterMeeting } from "@/lib/testAccounts";
import { Search, Star } from "lucide-react";
import { TrialLeadCard } from "@/components/csm/TrialLeadCard";
import { BookTrialLeadDialog } from "@/components/csm/BookTrialLeadDialog";
import { useAllTrialLeads, type TrialLead } from "@/hooks/useTrialDay";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * CSM-native Appointments. Same source of truth as the admin Meetings page
 * (meetings + meeting_scores; status writes go through the shared
 * UpdateMeetingStatusModal, scores through the shared ScoreMeetingDrawer),
 * but organized around the CSM's daily loop: resolve attendance on
 * past-dated fulfilment meetings, then score the sat ones.
 */

type TabKey = "attention" | "upcoming" | "to_score" | "all" | "trialist";
const TAB_KEYS: TabKey[] = ["attention", "upcoming", "to_score", "all", "trialist"];

const RESOLVED = ["sat", "no_show", "rescheduled", "cancelled"];

interface MeetingRow {
  id: string;
  company_name: string | null;
  prospect_name: string | null;
  meeting_date: string;
  meeting_time: string;
  attendance_status: string | null;
  status: string | null;
  approved_by_admin: boolean | null;
  department: string | null;
  is_rebook: boolean | null;
  setter_profile_id: string | null;
  logged_by_setter_id: string | null;
  client_profile_id: string | null;
  created_at: string | null;
  scoring_exempt: boolean | null;
  scoring_exempt_reason: string | null;
  scoring_exempt_by: string | null;
  scoring_exempt_at: string | null;
  client_profiles?: { id: string; company_name: string | null } | null;
}

const CSMAppointments = () => {
  const { user, userRoles } = useAuth();
  const canScore =
    userRoles?.includes("csm") || userRoles?.includes("admin") || userRoles?.includes("dev");

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [setterProfiles, setSetterProfiles] = useState<
    Array<{ id: string; user_id: string | null; full_name: string | null; email: string | null; active: boolean | null }>
  >([]);
  const [meetingScores, setMeetingScores] = useState<MeetingScore[]>([]);
  const [loading, setLoading] = useState(true);
  // ?tab=trialist deep-links from the bell notification (Trial Day, 15 Sep).
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab && (TAB_KEYS as string[]).includes(initialTab) ? (initialTab as TabKey) : "attention",
  );
  const [search, setSearch] = useState("");
  // Trial Day (15 Sep): leads trialists logged, waiting for Daniel's QA.
  const { data: trialLeads = [], refetch: refetchTrialLeads } = useAllTrialLeads();
  // 16 Oct 2026 (the owner): book it on the client's calendar; no more pushing to a setter.
  const [bookLead, setBookLead] = useState<TrialLead | null>(null);
  const [trialFilter, setTrialFilter] = useState<"open" | "all">("open");

  const [statusMeeting, setStatusMeeting] = useState<MeetingRow | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<MeetingRow | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [assignMeetingId, setAssignMeetingId] = useState<string | null>(null);
  const [scoringMeeting, setScoringMeeting] = useState<ScorableMeeting | null>(null);
  const [rescoring, setRescoring] = useState<MeetingScore | null>(null);
  const [viewingScore, setViewingScore] = useState<MeetingScore | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [meetingsRes, settersRes, scoresRes, testIds] = await Promise.all([
      supabase
        .from("meetings")
        .select("*, client_profiles(id, company_name)")
        .order("meeting_date", { ascending: false })
        .limit(500),
      supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, active"),
      supabase
        .from("meeting_scores")
        .select("*")
        .not("appointment_id", "is", null)
        .limit(1000),
      fetchTestSetterIds(),
    ]);
    // The CSM works fulfilment; meetings without a department tag are
    // treated as fulfilment, matching the admin page's fallback.
    // Demo/test setters' meetings never appear on this shared surface.
    setMeetings(
      ((meetingsRes.data || []) as MeetingRow[]).filter(
        (m) => (!m.department || m.department === "fulfilment") && !isTestSetterMeeting(m, testIds),
      ),
    );
    setSetterProfiles(settersRes.data || []);
    setMeetingScores(scoresRes.error ? [] : ((scoresRes.data || []) as MeetingScore[]));
    setLoading(false);
  };

  const getSetterName = (meeting: MeetingRow) => {
    if (!meeting.logged_by_setter_id && !meeting.setter_profile_id) return "SDR Trialist";
    const byUser = setterProfiles.find((s) => s.user_id === meeting.logged_by_setter_id);
    const byProfile = setterProfiles.find((s) => s.id === meeting.setter_profile_id);
    const setter = byUser || byProfile;
    if (!setter) return "Unknown Setter";
    const name = setter.full_name || setter.email || "Unknown Setter";
    return setter.active ? name : `${name} (inactive)`;
  };

  const scoreByAppointment = useMemo(() => {
    const map = new Map<string, MeetingScore>();
    for (const s of meetingScores) {
      if (!s.appointment_id) continue;
      const isNative = (s as unknown as { source?: string }).source === "native";
      if (!map.has(s.appointment_id) || isNative) map.set(s.appointment_id, s);
    }
    return map;
  }, [meetingScores]);

  const isPast = (m: MeetingRow) => new Date(`${m.meeting_date}T${m.meeting_time || "00:00"}`) < new Date();
  const unresolved = (m: MeetingRow) => !RESOLVED.includes(m.attendance_status || "");

  const buckets = useMemo(() => {
    const attention = meetings.filter((m) => isPast(m) && unresolved(m) && m.status !== "rejected");
    const upcoming = meetings.filter(
      (m) => !isPast(m) && m.status !== "rejected" && m.attendance_status !== "cancelled",
    );
    const toScore = meetings.filter(
      (m) =>
        m.attendance_status === "sat" &&
        !m.scoring_exempt &&
        !scoreByAppointment.has(String(m.id)),
    );
    return { attention, upcoming, to_score: toScore, all: meetings, trialist: [] as MeetingRow[] };
  }, [meetings, scoreByAppointment]);

  const openTrialLeads = useMemo(() => trialLeads.filter((l) => l.status === "submitted" || l.status === "pushed"), [trialLeads]);
  const visibleTrialLeads = (trialFilter === "open" ? openTrialLeads : trialLeads).filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (l.company_name || "").toLowerCase().includes(q) ||
      (l.contact_name || "").toLowerCase().includes(q) ||
      (l.trialist?.full_name || "").toLowerCase().includes(q) ||
      (l.client?.company_name || "").toLowerCase().includes(q)
    );
  });

  const visible = (buckets[activeTab] || []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.company_name || "").toLowerCase().includes(q) ||
      (m.prospect_name || "").toLowerCase().includes(q) ||
      getSetterName(m).toLowerCase().includes(q) ||
      (m.client_profiles?.company_name || "").toLowerCase().includes(q)
    );
  });

  // Approving a meeting is the CSM's quality gate before the client ever sees
  // it (Daniel, 26 Aug: he had no way to approve from his own page — the
  // button only existed on the admin surface, though is_admin_role already
  // grants csm the write).
  const approve = async (m: MeetingRow) => {
    if (!m.client_profiles?.company_name && !m.client_profile_id) {
      toast.error("Assign a client to this meeting first");
      return;
    }
    setApprovingId(String(m.id));
    const { error } = await supabase
      .from("meetings")
      .update({
        status: "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        approved_by_admin: true,
      })
      .eq("id", m.id);
    setApprovingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Approved — the client can see it now");
    loadAll();
  };

  const statusBadge = (m: MeetingRow) => {
    if (m.attendance_status === "sat") return <Pill variant="ok">Sat</Pill>;
    if (m.attendance_status === "no_show") return <Pill variant="bad">No show</Pill>;
    if (m.attendance_status === "rescheduled") return <Pill variant="warn">Rescheduled</Pill>;
    if (m.attendance_status === "cancelled") return <Pill variant="bad">Cancelled</Pill>;
    if (m.status === "rejected") return <Pill variant="bad">Rejected</Pill>;
    if (m.approved_by_admin) return <Pill variant="info">Approved</Pill>;
    return <Pill>Pending</Pill>;
  };

  const toScorable = (m: MeetingRow): ScorableMeeting => ({
    id: String(m.id),
    meeting_date: m.meeting_date,
    company_name: m.company_name,
    prospect_name: m.prospect_name,
    setterName: getSetterName(m),
    clientName: m.client_profiles?.company_name || "—",
  });

  const scoreAction = (m: MeetingRow) => {
    if (m.attendance_status !== "sat" || m.scoring_exempt) return null;
    const score = scoreByAppointment.get(String(m.id));
    if (score) {
      const overall = Number(score.overall_quality);
      const isNative = (score as unknown as { source?: string }).source === "native";
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewingScore(score)}
            title="View score breakdown"
            className={`inline-flex items-center gap-1 rounded-[4px] border px-[6px] py-[1px] font-mono text-[10.5px] font-semibold tabular-nums ${scoreColorClasses(overall)}`}
          >
            {overall.toFixed(2)}
            <Star className="h-3 w-3" />
          </button>
          {canScore && isNative && (
            <ButtonV2
              variant="ghost"
              size="sm"
              onClick={() => {
                setRescoring(score);
                setScoringMeeting(toScorable(m));
              }}
            >
              Edit
            </ButtonV2>
          )}
        </div>
      );
    }
    if (!canScore) return null;
    return (
      <ButtonV2
        size="sm"
        onClick={() => {
          setRescoring(null);
          setScoringMeeting(toScorable(m));
        }}
      >
        Score
      </ButtonV2>
    );
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Appointments"
          subtitle="Resolve attendance, then score sat meetings — fulfilment appointments only"
        />

        <div className="space-y-4">
          <StatStrip
            stats={[
              { label: "Needs attention", value: buckets.attention.length, caption: "Past meetings without a status" },
              { label: "Upcoming", value: buckets.upcoming.length },
              { label: "To score", value: buckets.to_score.length, caption: "Sat, not yet scored" },
              { label: "All fulfilment", value: buckets.all.length },
              { label: "Trialist leads", value: openTrialLeads.filter((l) => l.status === "submitted").length, caption: "Waiting on you" },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="attention">Needs attention ({buckets.attention.length})</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming ({buckets.upcoming.length})</TabsTrigger>
                <TabsTrigger value="to_score">To score ({buckets.to_score.length})</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="trialist">Trialist leads ({openTrialLeads.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[220px]">
              <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
              />
            </div>
          </div>

          {activeTab === "trialist" ? (
            <Panel
              title="Trialist leads"
              meta="Logged on the trial day. Open the Close link, listen, then book it on the client's calendar or mark it not a fit."
              aside={<div className="flex gap-[6px]">
                {(["open", "all"] as const).map((f) => (
                  <Chip key={f} selected={trialFilter === f} onClick={() => setTrialFilter(f)}>
                    {f === "open" ? `Open · ${openTrialLeads.length}` : `All · ${trialLeads.length}`}
                  </Chip>
                ))}
              </div>}
            >
              {visibleTrialLeads.length === 0 ? (
                <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">
                  {trialFilter === "open" ? "No trialist leads waiting on you." : "No trialist leads yet."}
                </p>
              ) : (
                <div className="divide-y divide-[var(--line)]">
                  {visibleTrialLeads.map((l) => (
                    <TrialLeadCard key={l.id} lead={l} onBook={setBookLead} />
                  ))}
                </div>
              )}
            </Panel>
          ) : (
          <Panel
            title={activeTab === "attention" ? "Needs attention" : activeTab === "upcoming" ? "Upcoming" : activeTab === "to_score" ? "To score" : "All fulfilment appointments"}
            aside={<Pill variant={activeTab === "attention" && visible.length > 0 ? "warn" : "default"}>{visible.length}</Pill>}
          >
            {loading ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">Loading appointments…</p>
            ) : visible.length === 0 ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">
                {activeTab === "attention"
                  ? "Nothing needs attention — every past meeting has a status."
                  : activeTab === "to_score"
                  ? "Nothing waiting to be scored."
                  : "No meetings found."}
              </p>
            ) : (
              <RowList columns="128px minmax(0,1fr) auto">
                {visible.map((m) => (
                  <Row key={m.id} onClick={() => setDetailMeeting(m)} focus={activeTab === "attention"}>
                    <RowNum className="text-[var(--dim)]">{m.meeting_date} · {String(m.meeting_time).slice(0, 5)}</RowNum>
                    <RowName
                      primary={<span className="flex flex-wrap items-center gap-[6px]">{m.company_name}{m.is_rebook && <Pill variant="warn">Rebook</Pill>}{statusBadge(m)}{m.scoring_exempt && <Pill variant="info" title={`${m.scoring_exempt_reason || "No reason recorded"}${m.scoring_exempt_at ? ` — set ${format(new Date(m.scoring_exempt_at), "d MMM yyyy")}` : ""}`}>Scoring exempt</Pill>}</span>}
                      secondary={<>{m.prospect_name} · {getSetterName(m)}{m.client_profiles?.company_name ? <span className="text-[var(--accent)]"> · {m.client_profiles.company_name}</span> : null}</>}
                    />
                    <div className="flex items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
                      {!m.approved_by_admin && m.status !== "rejected" && (
                        <ButtonV2 size="sm" variant="primary" disabled={approvingId === String(m.id)} onClick={() => approve(m)}>
                          {approvingId === String(m.id) ? "Approving…" : "Approve"}
                        </ButtonV2>
                      )}
                      {scoreAction(m)}
                      {/* Sat-but-unscored meetings stay editable so an exemption
                          can be set (or unticked) after attendance was resolved. */}
                      {(unresolved(m) ||
                        (m.attendance_status === "sat" &&
                          !scoreByAppointment.has(String(m.id)))) && (
                        <ButtonV2 size="sm" onClick={() => setStatusMeeting(m)}>Update status</ButtonV2>
                      )}
                      <ButtonV2 size="sm" variant="ghost" onClick={() => setDetailMeeting(m)}>View</ButtonV2>
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
          )}
        </div>

        <BookTrialLeadDialog
          lead={bookLead}
          open={!!bookLead}
          onOpenChange={(o) => {
            if (!o) { setBookLead(null); refetchTrialLeads(); loadAll(); }
          }}
        />

        {statusMeeting && (
          <UpdateMeetingStatusModal
            open={!!statusMeeting}
            onOpenChange={(o) => !o && setStatusMeeting(null)}
            meeting={statusMeeting}
            onUpdated={loadAll}
            // Already-resolved sat meetings were never status-editable from this
            // page; they open locked to Sat with only the exemption changeable.
            exemptionOnly={!unresolved(statusMeeting)}
          />
        )}

        <MeetingDetailDrawer
          open={!!detailMeeting}
          onOpenChange={(o) => !o && setDetailMeeting(null)}
          meeting={detailMeeting}
          onUpdate={loadAll}
          onAssignClient={(meetingId) => setAssignMeetingId(meetingId)}
          getSetterName={getSetterName}
        />

        <ClientAssignmentModal
          open={!!assignMeetingId}
          onOpenChange={(o) => !o && setAssignMeetingId(null)}
          meetingId={assignMeetingId || ""}
          onAssigned={loadAll}
        />

        <ScoreMeetingDrawer
          open={!!scoringMeeting}
          onOpenChange={(o) => {
            if (!o) {
              setScoringMeeting(null);
              setRescoring(null);
            }
          }}
          meeting={scoringMeeting}
          existingScore={rescoring}
          onSaved={loadAll}
        />

        <MeetingScoreCard
          score={viewingScore}
          open={!!viewingScore}
          onOpenChange={(o) => !o && setViewingScore(null)}
        />
      </PageContainer>
    </DashboardLayout>
  );
};

export default CSMAppointments;
