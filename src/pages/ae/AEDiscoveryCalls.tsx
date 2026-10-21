import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ButtonV2, Chip, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { Check, X } from "lucide-react";
import { format, isToday, isPast, isFuture } from "date-fns";
import { toast } from "sonner";
import { DiscoveryOutcomeDialog, type OutcomeSaveData } from "@/components/acquisition/DiscoveryOutcomeDialog";
import { LogDiscoveryModal } from "@/components/acquisition/LogDiscoveryModal";
import { ViewDiscoveryCallDrawer } from "@/components/acquisition/ViewDiscoveryCallDrawer";
import { AcquisitionMeetingDetailModal } from "@/components/acquisition/AcquisitionMeetingDetailModal";
import { ACQ_QUAL_GATES, formatAppointmentSource, type AcqQualScore } from "@/components/acquisition/AcquisitionMeetingCard";
import { ConvertReferralModal, type ConvertibleReferral } from "@/components/acquisition/ConvertReferralModal";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ListSearchSort, applySearchSort } from "@/components/acquisition/ListSearchSort";
import { bookCandidateSlot } from "@/hooks/useBookingEvent";


type MeetingFilter = "today" | "upcoming" | "needs_outcome" | "completed";

export default function AEDiscoveryCalls() {
  const queryClient = useQueryClient();
  const { user, userRole } = useAuth();
  // Admin-tier users (Marcus conducting discoveries himself) also see the
  // unassigned pool — claim-on-save already assigns the meeting to whoever
  // logs the outcome. AEs keep seeing only their own list.
  const isAdminTier = userRole === "admin" || userRole === "dev";
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");
  const initialFilter = filterParam === "needs_action" ? "needs_outcome" : "today";
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>(initialFilter as MeetingFilter);

  // Search + Sort state
  const [meetingsSearch, setMeetingsSearch] = useState("");
  const [meetingsSortBy, setMeetingsSortBy] = useState<string>("meeting_date");
  const [meetingsSortDir, setMeetingsSortDir] = useState<"asc" | "desc">("asc");
  const [meetingsMonth, setMeetingsMonth] = useState<string>(""); // YYYY-MM, "" = all

  const [historySearch, setHistorySearch] = useState("");
  const [historySortBy, setHistorySortBy] = useState<string>("meeting_at");
  const [historySortDir, setHistorySortDir] = useState<"asc" | "desc">("desc");

  // Collapsible states
  const [isMeetingsOpen, setIsMeetingsOpen] = usePersistedState('ae-disco-meetings-open', true);
  const [isHistoryOpen, setIsHistoryOpen] = usePersistedState('ae-disco-history-open', false);


  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [viewDrawerLog, setViewDrawerLog] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailModalMeeting, setDetailModalMeeting] = useState<any>(null);
  const [isSavingOutcome, setIsSavingOutcome] = useState(false);
  const [logDiscoveryOpen, setLogDiscoveryOpen] = useState(false);
  const [convertReferral, setConvertReferral] = useState<ConvertibleReferral | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  // Fetch acquisition meetings assigned to the current AE
  const { data: meetings, isLoading: isLoadingMeetings } = useQuery({
    queryKey: ["ae-discovery-meetings", user?.id, isAdminTier],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("meetings")
        .select(`
          *,
          setter_profile:setters_profiles!meetings_setter_profile_id_fkey(full_name, email),
          assigned_ae_profile:profiles!meetings_assigned_ae_id_fkey(full_name, email)
        `)
        .eq("department", "acquisition");
      // Admin tier sees the whole acquisition book (2 Sep): mine, the
      // unassigned pool, AND meetings still stamped with departed AEs —
      // otherwise inherited history is invisible. AEs stay self-scoped.
      if (!isAdminTier) query = query.eq("assigned_ae_id", user!.id);
      const { data, error } = await query
        .order("meeting_date", { ascending: true })
        .order("meeting_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Qualification scores for the loaded meetings. The acq_qual_scores table
  // is missing from the stale generated types.ts, hence the house `as any`
  // cast + local interface (MarkAsWonModal precedent). RLS returns only rows
  // whose meeting is assigned to this AE.
  const meetingIds = useMemo(() => (meetings ?? []).map((m: any) => m.id), [meetings]);
  const { data: qualScores } = useQuery({
    queryKey: ["ae-acq-qual-scores", meetingIds],
    enabled: meetingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acq_qual_scores" as any)
        .select("*")
        .in("meeting_id", meetingIds);
      if (error) throw error;
      return (data ?? []) as unknown as AcqQualScore[];
    },
  });

  const qualScoreMap = useMemo(() => {
    const map: Record<string, AcqQualScore> = {};
    qualScores?.forEach((row) => {
      // Close-native rows have no meeting_id and cannot key this map; they
      // surface on the SDR-manager tab until a meeting_id is backfilled.
      if (row.meeting_id) map[row.meeting_id] = row;
    });
    return map;
  }, [qualScores]);

  // Partner referrals awaiting conversion (visible to AE/admin tier via RLS)
  const { data: submittedReferrals } = useQuery({
    queryKey: ["ae-submitted-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*, partner:partners(full_name, company_name)")
        .eq("status", "submitted")
        .order("date_referred", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch discovery logs
  const { data: discoveryLogs } = useQuery({
    queryKey: ["ae-discovery-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_discovery_logs")
        .select("*")
        .order("meeting_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Create map of meeting_id to discovery log
  const meetingOutcomeMap = useMemo(() => {
    const map: Record<string, any> = {};
    discoveryLogs?.forEach((log) => {
      if (log.meeting_id) {
        map[log.meeting_id] = log;
      }
    });
    return map;
  }, [discoveryLogs]);

  const FINAL_ATTENDANCE_STATUSES = new Set(["sat", "no_show", "cancelled", "rescheduled"]);

  const getEffectiveAttendanceStatus = (meeting: any) =>
    (meeting?.attendance_status || meeting?.status || null) as string | null;

  const isAttendanceFinalized = (meeting: any) => {
    const s = getEffectiveAttendanceStatus(meeting);
    return !!s && FINAL_ATTENDANCE_STATUSES.has(s);
  };

  const hasOutcomeForFiltering = (meeting: any) => {
    return !!meetingOutcomeMap[meeting.id] || isAttendanceFinalized(meeting);
  };

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    if (!meetings) return [];
    return meetings.filter((meeting) => {
      const meetingDate = new Date(meeting.meeting_date);
      const hasOutcome = hasOutcomeForFiltering(meeting);
      const isTodayMeeting = isToday(meetingDate);
      const isPastMeeting = isPast(meetingDate) && !isTodayMeeting;
      const isUpcoming = isFuture(meetingDate);

      switch (meetingFilter) {
        case "today":
          return isTodayMeeting && !hasOutcome;
        case "upcoming":
          return isUpcoming && !hasOutcome;
        case "needs_outcome":
          return !hasOutcome && (isPastMeeting || isTodayMeeting);
        case "completed":
          // Admin tier sees the whole completed history — incl. meetings the
          // departed AEs finished (2 Sep; the list query already fetches them).
          return hasOutcome && (isAdminTier || meeting.assigned_ae_id === user?.id);
        default:
          return true;
      }
    });
  }, [meetings, meetingFilter, meetingOutcomeMap]);

  // Needs Outcome banner backlog, newest-first (the owner's ruling 2026-07-30:
  // AEs work backward from today through July, June, …). Same population the
  // "Needs Outcome" filter shows; base query is date-ascending, so reverse.
  const needsOutcomeMeetings = useMemo(() => {
    if (!meetings) return [];
    return meetings
      .filter((m) => {
        const meetingDate = new Date(m.meeting_date);
        const hasOutcome = hasOutcomeForFiltering(m);
        return !hasOutcome && (isPast(meetingDate) || isToday(meetingDate));
      })
      .reverse();
  }, [meetings, meetingOutcomeMap]);

  const needsOutcomeCount = needsOutcomeMeetings.length;

  // Quick action: jump straight into the existing status-modal → drawer →
  // handleSaveOutcome chain with the outcome preselected. Deliberately NOT a
  // one-click direct write: every outcome has required inputs in the real
  // flow (no-show checklist, cancellation reason, reschedule details, sat


  // Month options derived from currently-filtered meetings (desc, most recent first)
  const meetingsMonthOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of filteredMeetings) {
      if (!m.meeting_date) continue;
      const key = String(m.meeting_date).slice(0, 7); // YYYY-MM
      if (!map.has(key)) {
        const d = new Date(`${key}-01T00:00:00`);
        map.set(key, format(d, "MMMM yyyy"));
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [filteredMeetings]);

  // Apply month filter + search + sort to meetings
  const displayedMeetings = useMemo(() => {
    const monthFiltered = meetingsMonth
      ? filteredMeetings.filter(
          (m: any) => m.meeting_date && String(m.meeting_date).startsWith(meetingsMonth),
        )
      : filteredMeetings;
    return applySearchSort(
      monthFiltered,
      meetingsSearch,
      (m: any) => [
        m.company_name,
        m.prospect_name,
        m.prospect_email,
        m.setter_profile?.full_name,
        m.assigned_ae_profile?.full_name,
      ],
      meetingsSortBy,
      meetingsSortDir,
      (m: any, key) => {
        switch (key) {
          case "meeting_date":
            return new Date(`${m.meeting_date}T${m.meeting_time || "00:00:00"}`);
          case "company_name":
            return (m.company_name || "").toLowerCase();
          case "prospect_name":
            return (m.prospect_name || "").toLowerCase();
          case "setter":
            return (m.setter_profile?.full_name || "").toLowerCase();
          case "contract_value":
            return Number(m.contract_value) || 0;
          default:
            return null;
        }
      },
    );
  }, [filteredMeetings, meetingsSearch, meetingsSortBy, meetingsSortDir, meetingsMonth]);

  // Apply search + sort to completed discovery logs
  const displayedLogs = useMemo(() => {
    return applySearchSort(
      discoveryLogs || [],
      historySearch,
      (l: any) => [l.client_name, l.client_email, l.outcome],
      historySortBy,
      historySortDir,
      (l: any, key) => {
        switch (key) {
          case "meeting_at":
            return new Date(l.meeting_at);
          case "client_name":
            return (l.client_name || "").toLowerCase();
          case "outcome":
            return (l.outcome || "").toLowerCase();
          default:
            return null;
        }
      },
    );
  }, [discoveryLogs, historySearch, historySortBy, historySortDir]);


  // 18 Sep (Marcus): click a meeting → straight onto the outcome. Details
  // stay one click away inside the dialog.
  const handleMeetingClick = (meeting: any) => {
    const existingLog = meetingOutcomeMap[meeting.id];
    if (existingLog) {
      setViewDrawerLog(existingLog);
      setIsViewDrawerOpen(true);
    } else {
      setSelectedMeeting({ ...meeting, hasOutcome: false, existingOutcome: null });
      setIsDrawerOpen(true);
    }
  };

  const handleOpenStatusFromDetail = () => {
    setShowDetailModal(false);
    setSelectedMeeting({ ...detailModalMeeting, hasOutcome: false, existingOutcome: null });
    setIsDrawerOpen(true);
  };

  const handleSaveOutcome = async (data: OutcomeSaveData) => {
    setIsSavingOutcome(true);
    try {
      const meeting = selectedMeeting;
      if (!meeting) throw new Error("No meeting selected");
      if (!user?.id) throw new Error("You must be signed in to save an outcome");

      if (!meeting.assigned_ae_id) {
        const { data: claimedMeeting, error: claimError } = await supabase
          .from("meetings")
          .update({ assigned_ae_id: user.id })
          .eq("id", meeting.id)
          .is("assigned_ae_id", null)
          .select("id")
          .maybeSingle();

        if (claimError) throw claimError;

        if (!claimedMeeting) {
          const { data: latestMeeting, error: latestMeetingError } = await supabase
            .from("meetings")
            .select("assigned_ae_id")
            .eq("id", meeting.id)
            .single();

          if (latestMeetingError) throw latestMeetingError;

          if (latestMeeting.assigned_ae_id !== user.id) {
            queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
            throw new Error("This meeting has already been claimed by another Account Executive.");
          }
        }
      }

      const { data: existingLog, error: existingLogError } = await supabase
        .from("sales_discovery_logs")
        .select("id")
        .eq("meeting_id", data.meeting_id)
        .maybeSingle();

      if (existingLogError) throw existingLogError;
      if (existingLog) {
        queryClient.invalidateQueries({ queryKey: ["ae-discovery-logs"] });
        queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
        throw new Error("This meeting already has a saved discovery outcome.");
      }

      // Propagate the pipeline re-engagement flag from the meeting into the
      // discovery log (feeds future re-engagement conversion metrics).
      // Fetched separately with errors swallowed so this works whether or
      // not the meetings.is_pipeline_reengagement migration has run.
      let isPipelineReengagement = false;
      try {
        const { data: flagRow } = await supabase
          .from("meetings")
          .select("is_pipeline_reengagement")
          .eq("id", data.meeting_id)
          .maybeSingle();
        isPipelineReengagement =
          (flagRow as { is_pipeline_reengagement?: boolean } | null)
            ?.is_pipeline_reengagement === true;
      } catch {
        // Column not migrated yet — treat as false.
      }

      const { data: insertedLog, error } = await supabase.from("sales_discovery_logs").insert({
        meeting_id: data.meeting_id,
        client_name: meeting.company_name,
        client_email: meeting.prospect_email,
        meeting_at: new Date(`${meeting.meeting_date}T${meeting.meeting_time}`).toISOString(),
        attendance_confirmed: data.attendance_confirmed,
        team_network_member: data.team_network_member,
        outcome: data.meeting_status,
        contract_value: data.contract_value,
        contract_term: data.contract_term,
        is_pipeline_reengagement: isPipelineReengagement,
      }).select('id, client_name, meeting_at').single();
      if (error) throw error;

      await supabase
        .from("meetings")
        .update({
          assigned_ae_id: user.id,
          status: data.meeting_status,
          attendance_status: data.meeting_status,
          // Sat-only: setter Discos Sat / Show-up read this flag as "prospect
          // attended" (isMeetingSat) — a non-sat outcome must never set it.
          attendance_confirmed: data.meeting_status === "sat",
          outcome_confirmed_at: new Date().toISOString(),
        })
        .eq("id", data.meeting_id);

      // Handle status-specific side effects
      const sd = data.statusData;
      if (sd.status === 'sat_follow_up' && sd.follow_up_date && sd.follow_up_time) {
        await supabase.from('pitch_calls').insert({
          discovery_log_id: insertedLog.id,
          client_name: meeting.company_name,
          client_email: meeting.prospect_email,
          company_name: meeting.company_name,
          pitch_call_date: sd.follow_up_date,
          pitch_call_time: sd.follow_up_time,
          contract_value: data.contract_value,
          contract_term: data.contract_term,
          status: 'scheduled',
          created_by: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['ae-pitch-calls'] });
        // Live-picked slot → book it through the engine: calendar invite to the
        // prospect on the AE's calendar, SMS confirmation, reminders queued.
        if (sd.follow_up_booking) {
          const res = await bookCandidateSlot({
            eventTypeId: sd.follow_up_booking.eventTypeId,
            hostUserId: sd.follow_up_booking.hostUserId,
            startsAt: sd.follow_up_booking.startsAt,
            name: meeting.prospect_name,
            email: meeting.prospect_email,
            mobile: meeting.prospect_mobile,
          });
          if (res.ok) toast.success("Follow-up booked — calendar invite and SMS sent");
          else toast.error(`Follow-up saved, but the calendar booking failed: ${res.error}. Send the invite manually.`);
        }
      }

      if (sd.status === 'rescheduled') {
        if (sd.reschedule_mode === 'assign_setter') {
          // Flag the meeting for setter rebooking — the DB trigger
          // (notify_setter_rebook_needed) sends the setter notification.
          // Client-side notification inserts are RLS-blocked.
          await supabase
            .from('meetings')
            .update({ needs_setter_rebook: true } as never)
            .eq('id', data.meeting_id);
        } else if (sd.reschedule_date && sd.reschedule_time) {
          const { data: rebooked } = await supabase.from('meetings').insert({
            company_name: meeting.company_name,
            prospect_name: meeting.prospect_name,
            prospect_email: meeting.prospect_email,
            prospect_mobile: meeting.prospect_mobile,
            prospect_linkedin: meeting.prospect_linkedin,
            company_website: meeting.company_website,
            meeting_date: sd.reschedule_date,
            meeting_time: sd.reschedule_time,
            status: 'pending',
            attendance_status: 'pending',
            attendance_confirmed: false,
            department: 'acquisition',
            assigned_ae_id: user.id,
            setter_id: meeting.setter_id,
            setter_profile_id: meeting.setter_profile_id,
            is_rebook: true,
            original_meeting_id: meeting.id,
            notes: `Rescheduled from ${meeting.meeting_date}`,
          }).select('id').single();

          // Live-picked slot → book it through the engine so the prospect gets
          // a real invite for the NEW time on the AE's calendar. Without this a
          // reschedule only moved the row in Vexon OS: the prospect's calendar
          // still showed the old time and nobody told them (the owner, 26 Aug).
          if (sd.reschedule_booking) {
            const res = await bookCandidateSlot({
              eventTypeId: sd.reschedule_booking.eventTypeId,
              hostUserId: sd.reschedule_booking.hostUserId,
              startsAt: sd.reschedule_booking.startsAt,
              name: meeting.prospect_name,
              email: meeting.prospect_email,
              mobile: meeting.prospect_mobile,
              rebookOfMeetingId: meeting.id,
            });
            if (res.ok) {
              // Marcus's 21 Aug ruling stands: the original invite is never
              // cancelled AUTOMATICALLY, because prospects sometimes revert to
              // the first time. the owner's 26 Aug follow-up: offer it right here
              // in one click, so the AE isn't left hunting for it and the
              // prospect isn't left holding two live invites.
              toast.success("Rescheduled — new invite sent", {
                duration: 15000,
                description:
                  "The original invite is still live, in case they revert. Release it if the new time is settled.",
                action: {
                  label: "Cancel original",
                  onClick: async () => {
                    const { data: cx, error: cErr } = await supabase.functions.invoke(
                      "booking-cancel",
                      {
                        body: {
                          meeting_id: meeting.id,
                          reason: "rescheduled — original invite released by the AE",
                          mark_meeting_status: "rescheduled",
                        },
                      },
                    );
                    const failMsg = cErr?.message || (cx as any)?.error;
                    if (failMsg) toast.error(`Couldn't cancel the original invite: ${failMsg}`);
                    else {
                      toast.success("Original invite cancelled — the prospect has been notified");
                      queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
                    }
                  },
                },
              });
            } else {
              toast.error(
                `Rescheduled in Vexon OS, but the calendar booking failed: ${res.error}. Send the new invite manually.`,
              );
            }
          }
        }
      }

      // no_show: the DB trigger (notify_setter_rebook_needed) notifies the
      // setter when attendance_status transitions — no client insert needed.

      if (sd.status === 'cancelled' && sd.cancel_reason) {
        await supabase.from('meetings').update({
          notes: meeting.notes
            ? `${meeting.notes}\n\nCancellation Reason: ${sd.cancel_reason}`
            : `Cancellation Reason: ${sd.cancel_reason}`,
        }).eq('id', data.meeting_id);
      }

      // 18 Sep: Marcus's sector + pain points live on the meeting itself so
      // every disco carries them, reference or not. Separate update so a
      // pre-migration DB doesn't break the save.
      if (data.sector || data.pain_points) {
        const { error: extraErr } = await supabase
          .from("meetings")
          .update({ sector: data.sector, pain_points: data.pain_points } as never)
          .eq("id", data.meeting_id);
        if (extraErr) console.warn("sector/pain_points not saved (migration pending?)", extraErr.message);
      }

      // 18 Sep: "Is this a reference?" → the partner gets the prospect's
      // details (bell via DB trigger, email via partner-reference).
      if (data.reference) {
        const { data: refRow, error: refErr } = await supabase
          .from("partner_references" as never)
          .insert({
            partner_id: data.reference.partner_id,
            meeting_id: data.meeting_id,
            requested_by: user.id,
            contact_name: meeting.prospect_name,
            company_name: meeting.company_name,
            sector: data.sector,
            mobile: meeting.prospect_mobile,
            linkedin_url: meeting.prospect_linkedin,
            email: meeting.prospect_email,
            pain_points: data.pain_points,
            note: data.reference.note || null,
          } as never)
          .select("id")
          .single();
        if (refErr) toast.error(`Outcome saved, but the reference wasn't created: ${refErr.message}`);
        else {
          const { data: mail } = await supabase.functions.invoke("partner-reference", { body: { action: "notify_new", reference_id: (refRow as { id: string }).id } });
          if ((mail as { ok?: boolean } | null)?.ok) toast.success("Reference sent to the partner");
          else toast.warning("Reference saved in the partner's portal, but the email didn't send.");
        }
      }

      // Save feedback if provided (sat statuses)
      if (data.feedback && insertedLog) {
        await supabase.from('post_discovery_feedback').insert({
          discovery_log_id: insertedLog.id,
          ae_user_id: user.id,
          client_name: meeting.company_name,
          call_date: new Date(`${meeting.meeting_date}T${meeting.meeting_time}`).toISOString(),
          ...data.feedback,
        } as never);
      }

      // Patch the cache so the row leaves Needs Outcome instantly; the
      // invalidations below refetch the confirmed state right after.
      queryClient.setQueryData(
        ["ae-discovery-meetings", user.id],
        (old: any[] | undefined) =>
          old?.map((m) =>
            m.id === data.meeting_id
              ? {
                  ...m,
                  attendance_status: data.meeting_status,
                  attendance_confirmed: data.meeting_status === "sat",
                }
              : m,
          ),
      );
      queryClient.invalidateQueries({ queryKey: ["ae-discovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
      queryClient.invalidateQueries({ queryKey: ["ae-needs-outcome-count"] });
      toast.success("Discovery call outcome saved");
      setIsDrawerOpen(false);
    } catch (error: any) {
      console.error("Error saving outcome:", error);
      toast.error(error.message || "Failed to save outcome");
    } finally {
      setIsSavingOutcome(false);
    }
  };

  // ---- Row helpers (15 Oct UI pass: rows, not cards) ----

  const whenRow = (date: string, time?: string | null) =>
    `${format(new Date(`${date}T12:00:00`), 'd MMM')}${time ? ` · ${String(time).slice(0, 5)}` : ''}`;

  const whenFromIso = (iso: string) => `${format(new Date(iso), 'd MMM yyyy')} · ${format(new Date(iso), 'HH:mm')}`;

  const meetingStatusPill = (meeting: { hasOutcome?: boolean; attendance_status?: string | null; status?: string | null }) => {
    if (meeting.hasOutcome) return <Pill variant="ok">Completed</Pill>;
    switch (meeting.attendance_status || meeting.status) {
      case 'approved':
        return <Pill variant="ok">Approved</Pill>;
      case 'pending':
        return <Pill variant="warn">Pending</Pill>;
      case 'sat':
        return <Pill variant="ok">Sat</Pill>;
      case 'no_show':
        return <Pill variant="bad">No show</Pill>;
      case 'cancelled':
        return <Pill>Cancelled</Pill>;
      case 'rescheduled':
        return <Pill variant="info">Rescheduled</Pill>;
      default:
        return null;
    }
  };

  const outcomePill = (outcome: string | null) => {
    const variant = outcome === 'sat' ? 'ok' : outcome === 'no_show' ? 'bad' : outcome === 'cancelled' ? 'default' : 'warn';
    return <Pill variant={variant}>{outcome ? outcome.replace(/_/g, ' ') : 'Unknown'}</Pill>;
  };

  const collapseToggle = (open: boolean) => (
    <CollapsibleTrigger asChild>
      <ButtonV2 variant="ghost" size="sm" aria-expanded={open}>{open ? 'Hide' : 'Show'}</ButtonV2>
    </CollapsibleTrigger>
  );

  const skeletonRows = (
    <div className="space-y-2 pt-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-[var(--surf2)]" />
      ))}
    </div>
  );

  const emptyText = (text: string) => <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">{text}</p>;

  const MEETING_FILTERS: { id: MeetingFilter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'needs_outcome', label: 'Needs outcome' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Discovery Calls"
          subtitle="Manage acquisition discovery meetings"
          actions={
            <ButtonV2 variant="primary" size="sm" onClick={() => setLogDiscoveryOpen(true)}>
              Log discovery
            </ButtonV2>
          }
        />

        <div className="space-y-6">
          {/* Partner referrals awaiting conversion */}
          {(submittedReferrals?.length ?? 0) > 0 && (
            <Panel
              title="Partner referrals"
              aside={<Pill variant="info">{submittedReferrals!.length} awaiting conversion</Pill>}
            >
              <RowList columns="minmax(0,1fr) 110px auto">
                {submittedReferrals!.map((referral) => {
                  const partnerName =
                    referral.partner?.company_name || referral.partner?.full_name || "Partner";
                  return (
                    <Row key={referral.id}>
                      <RowName
                        primary={
                          <span className="flex flex-wrap items-center gap-2">
                            {referral.referred_company_name}
                            <Pill variant="info">Partner referral · {partnerName}</Pill>
                          </span>
                        }
                        secondary={[referral.contact_full_name, referral.contact_mobile, referral.contact_email].filter(Boolean).join(' · ')}
                      />
                      <RowNum className="text-[var(--dim)]">{format(new Date(referral.date_referred), "d MMM yyyy")}</RowNum>
                      <div className="flex justify-end">
                        <ButtonV2
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setConvertReferral({
                              id: referral.id,
                              contact_full_name: referral.contact_full_name,
                              contact_mobile: referral.contact_mobile,
                              contact_email: referral.contact_email,
                              referred_company_name: referral.referred_company_name,
                              date_referred: referral.date_referred,
                              partnerName,
                            });
                            setConvertOpen(true);
                          }}
                        >
                          Convert to Discovery
                        </ButtonV2>
                      </div>
                    </Row>
                  );
                })}
              </RowList>
            </Panel>
          )}

          {/* Discovery calls (collapsible, state persisted) */}
          <Collapsible open={isMeetingsOpen} onOpenChange={setIsMeetingsOpen}>
            <Panel
              title="Discovery calls"
              meta={`${displayedMeetings.length} meeting${displayedMeetings.length !== 1 ? "s" : ""}`}
              aside={
                <div className="flex items-center gap-2">
                  {needsOutcomeCount > 0 && <Pill variant="bad">{needsOutcomeCount} needs outcome</Pill>}
                  {collapseToggle(isMeetingsOpen)}
                </div>
              }
            >
              <CollapsibleContent>
                <div className="flex flex-wrap items-center gap-2 py-3">
                  {MEETING_FILTERS.map((f) => (
                    <Chip key={f.id} selected={meetingFilter === f.id} onClick={() => setMeetingFilter(f.id)}>{f.label}</Chip>
                  ))}
                </div>

                <ListSearchSort
                  search={meetingsSearch}
                  onSearchChange={setMeetingsSearch}
                  sortBy={meetingsSortBy}
                  onSortByChange={setMeetingsSortBy}
                  sortDir={meetingsSortDir}
                  onSortDirChange={setMeetingsSortDir}
                  iconOnlySort
                  monthValue={meetingsMonth}
                  onMonthChange={setMeetingsMonth}
                  monthOptions={meetingsMonthOptions}
                  options={[
                    { value: "meeting_date", label: "Meeting date & time" },
                    { value: "company_name", label: "Company name" },
                    { value: "prospect_name", label: "Prospect name" },
                    { value: "setter", label: "Setter" },
                    { value: "contract_value", label: "Contract value" },
                  ]}
                  placeholder="Search company, prospect, setter, email…"
                />

                {isLoadingMeetings ? skeletonRows : displayedMeetings.length === 0 ? (
                  emptyText(
                    meetingsSearch
                      ? "No meetings match your search."
                      : meetingFilter === "today"
                      ? "No discovery calls scheduled for today."
                      : "No meetings match the selected filter.",
                  )
                ) : (
                  <RowList
                    columns="120px minmax(0,1fr) auto auto"
                    head={['When', 'Prospect', 'Status', <span key="a" className="text-right">Actions</span>]}
                  >
                    {displayedMeetings.map((meeting) => {
                      const hasOutcome = !!meetingOutcomeMap[meeting.id];
                      const meetingDate = new Date(meeting.meeting_date);
                      const isTodayMeeting = isToday(meetingDate);
                      const isPastMeeting = isPast(meetingDate) && !isTodayMeeting;
                      const isFinal = isAttendanceFinalized(meeting);
                      const needsOutcome = !hasOutcome && (isPastMeeting || isTodayMeeting) && !isFinal;
                      const rowMeeting = { ...meeting, hasOutcome };
                      const qualScore = qualScoreMap[meeting.id];
                      const facts = [
                        meeting.prospect_name,
                        meeting.prospect_email,
                        meeting.setter_profile ? `logged by ${meeting.setter_profile.full_name || meeting.setter_profile.email}` : null,
                        meeting.assigned_ae_profile ? `for ${meeting.assigned_ae_profile.full_name || meeting.assigned_ae_profile.email}` : null,
                        meeting.company_headcount,
                        meeting.revenue_last_12_months,
                      ].filter(Boolean);
                      return (
                        <Row
                          key={meeting.id}
                          focus={needsOutcome}
                          health={meeting.prospect_watched_video === false ? 'warn' : hasOutcome ? 'ok' : undefined}
                          onClick={() => handleMeetingClick(rowMeeting)}
                        >
                          <RowNum className="text-[var(--dim)]">{whenRow(meeting.meeting_date, meeting.meeting_time)}</RowNum>
                          <RowName
                            primary={
                              <span className="flex flex-wrap items-center gap-2">
                                {meeting.company_name}
                                {meeting.appointment_source && <Pill variant="info" title="Source of appointment">{formatAppointmentSource(meeting.appointment_source)}</Pill>}
                                {meeting.is_rebook && <Pill variant="warn">Rebook</Pill>}
                                {meeting.source_referral_id && <Pill variant="info" title="Converted from a partner referral">Partner referral</Pill>}
                                {meeting.client_confirmed_attendance !== null && meeting.client_confirmed_attendance !== undefined && (
                                  <Pill variant={meeting.client_confirmed_attendance ? 'ok' : 'default'} title="Reported by setter on confirmation call">Conf: {meeting.client_confirmed_attendance ? 'Yes' : 'No'}</Pill>
                                )}
                                {meeting.prospect_watched_video !== null && meeting.prospect_watched_video !== undefined && (
                                  <Pill variant={meeting.prospect_watched_video ? 'ok' : 'warn'} title="Reported by setter on confirmation call">Video: {meeting.prospect_watched_video ? 'Yes' : 'No'}</Pill>
                                )}
                                {qualScore && <QualScorePill qualScore={qualScore} />}
                              </span>
                            }
                            secondary={facts.join(' · ')}
                          />
                          <div className="flex items-center justify-end gap-[5px]">
                            {isTodayMeeting ? <Pill variant="info">Today</Pill> : isFuture(meetingDate) ? <Pill>Upcoming</Pill> : isPastMeeting ? <Pill>Past</Pill> : null}
                            {meetingStatusPill(rowMeeting)}
                          </div>
                          <div className="flex items-center justify-end gap-[8px]" onClick={(e) => e.stopPropagation()}>
                            <AcceptedToggle meetingId={meeting.id} initial={!!meeting.accepted_by_client} />
                            {needsOutcome && (
                              <ButtonV2 variant="primary" size="sm" onClick={() => handleMeetingClick(rowMeeting)}>Complete</ButtonV2>
                            )}
                          </div>
                        </Row>
                      );
                    })}
                  </RowList>
                )}
              </CollapsibleContent>
            </Panel>
          </Collapsible>

          {/* Completed discovery calls */}
          <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <Panel
              title="Completed discovery calls"
              meta={discoveryLogs && discoveryLogs.length > 0 ? `${discoveryLogs.length} logged` : undefined}
              aside={collapseToggle(isHistoryOpen)}
            >
              <CollapsibleContent>
                <div className="pt-3">
                  <ListSearchSort
                    search={historySearch}
                    onSearchChange={setHistorySearch}
                    sortBy={historySortBy}
                    onSortByChange={setHistorySortBy}
                    sortDir={historySortDir}
                    onSortDirChange={setHistorySortDir}
                    options={[
                      { value: "meeting_at", label: "Meeting date" },
                      { value: "client_name", label: "Client / company" },
                      { value: "outcome", label: "Outcome" },
                    ]}
                    placeholder="Search client, email, outcome…"
                  />
                </div>
                {!discoveryLogs || discoveryLogs.length === 0 ? (
                  emptyText("Complete a discovery call to see it here.")
                ) : displayedLogs.length === 0 ? (
                  emptyText("No completed discovery calls match your search.")
                ) : (
                  <RowList
                    columns="140px minmax(0,1fr) auto"
                    head={['When', 'Client', <span key="o" className="text-right">Outcome</span>]}
                  >
                    {displayedLogs.map((log) => (
                      <Row
                        key={log.id}
                        onClick={() => {
                          setViewDrawerLog(log);
                          setIsViewDrawerOpen(true);
                        }}
                      >
                        <RowNum className="text-[var(--dim)]">{whenFromIso(log.meeting_at)}</RowNum>
                        <RowName primary={log.client_name} secondary={log.client_email} />
                        <div className="flex justify-end">{outcomePill(log.outcome)}</div>
                      </Row>
                    ))}
                  </RowList>
                )}
              </CollapsibleContent>
            </Panel>
          </Collapsible>
        </div>
      </PageContainer>

        {/* Log Discovery Modal */}
        <LogDiscoveryModal
          open={logDiscoveryOpen}
          onOpenChange={setLogDiscoveryOpen}
          onLogged={() =>
            queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] })
          }
        />

        <ConvertReferralModal
          open={convertOpen}
          onOpenChange={setConvertOpen}
          referral={convertReferral}
          onConverted={() => {
            queryClient.invalidateQueries({ queryKey: ["ae-submitted-referrals"] });
            queryClient.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
          }}
        />

        {/* Meeting Detail Modal */}
        <AcquisitionMeetingDetailModal
          open={showDetailModal}
          onOpenChange={setShowDetailModal}
          meeting={detailModalMeeting}
          onUpdateStatus={handleOpenStatusFromDetail}
          hasOutcome={detailModalMeeting ? !!meetingOutcomeMap[detailModalMeeting.id] : false}
        />

        {/* Outcome: two steps, straight from the row (18 Sep) */}
        <DiscoveryOutcomeDialog
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          meeting={selectedMeeting}
          onSave={handleSaveOutcome}
          isSaving={isSavingOutcome}
          onShowDetails={() => { setDetailModalMeeting(selectedMeeting); setShowDetailModal(true); }}
        />

        <ViewDiscoveryCallDrawer
          log={viewDrawerLog}
          open={isViewDrawerOpen}
          onOpenChange={setIsViewDrawerOpen}
          onSendAgreement={() => {}}
          isAgreementSent={false}
          agreementStatus={null}
        />

    </DashboardLayout>
  );
}

/**
 * The qualification-score badge that used to live on AcquisitionMeetingCard,
 * as a Pill with the same popover (gates hit, evidence, booking-call facts).
 */
function QualScorePill({ qualScore }: { qualScore: AcqQualScore }) {
  let pill: JSX.Element;
  if (qualScore.status === "scored") {
    const n = qualScore.gates_hit ?? 0;
    pill = (
      <Pill variant={n === 5 ? "ok" : n >= 3 ? "warn" : "bad"} title="Qualification gates hit on the booking call">
        {n}/5 qualified
      </Pill>
    );
  } else if (qualScore.status === "dq_health") {
    pill = <Pill title="Policy disqualification — healthcare/NHS prospect; setter not penalised">DQ — Health</Pill>;
  } else {
    pill = <Pill title="No call transcript was available to score">No transcript</Pill>;
  }

  const infoRows = [
    { label: "Headcount", value: qualScore.info_headcount },
    { label: "Prior lead gen", value: qualScore.info_prior_leadgen },
    { label: "Years in business", value: qualScore.info_years_in_business },
  ].filter((r) => r.value);

  return (
    // The row has onClick; stop propagation like the Accepted switch wrapper.
    <span onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" aria-label="Qualification score details">
            {pill}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-2">
            <div className="space-y-1.5">
              {ACQ_QUAL_GATES.map((g) => {
                const hit = qualScore[g.key];
                const evidence = qualScore[g.evidenceKey] as string | null;
                return (
                  <div key={g.key} className="text-[12.5px]">
                    <div className="flex items-center gap-2">
                      {hit === true ? (
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ok)]" />
                      ) : hit === false ? (
                        <X className="h-3.5 w-3.5 flex-shrink-0 text-[var(--bad)]" />
                      ) : (
                        <span className="w-3.5 flex-shrink-0 text-center text-[var(--dim)]">—</span>
                      )}
                      <span>{g.label}</span>
                    </div>
                    {evidence && (
                      <p className="ml-6 text-[11.5px] text-[var(--dim)]">“{evidence}”</p>
                    )}
                  </div>
                );
              })}
            </div>
            {infoRows.length > 0 && (
              <div className="space-y-0.5 border-t border-[var(--line)] pt-2">
                {infoRows.map((r) => (
                  <div key={r.label} className="text-[11.5px] text-[var(--dim)]">
                    <span className="font-medium text-[var(--ink)]">{r.label}:</span> {r.value}
                  </div>
                ))}
              </div>
            )}
            {qualScore.status === "dq_health" && qualScore.health_flag_reason && (
              <div className="border-t border-[var(--line)] pt-2 text-[11.5px] text-[var(--dim)]">
                <span className="font-medium text-[var(--ink)]">Health DQ:</span> {qualScore.health_flag_reason}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/**
 * The "Accepted" switch that used to live on AcquisitionMeetingCard, now inline
 * in the row. Same write (accepted_by_client + client_accepted, status flips to
 * client_accepted when switched on), same optimistic revert on failure.
 */
function AcceptedToggle({ meetingId, initial }: { meetingId: string; initial: boolean }) {
  const [accepted, setAccepted] = useState(initial);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    setAccepted(checked);
    try {
      const updatePayload: { accepted_by_client: boolean; client_accepted: boolean; status?: string } = {
        accepted_by_client: checked,
        client_accepted: checked,
      };
      if (checked) updatePayload.status = "client_accepted";
      const { error } = await supabase.from("meetings").update(updatePayload).eq("id", meetingId);
      if (error) throw error;
      toast.success(checked ? "Client accepted" : "Client acceptance removed");
    } catch {
      setAccepted(!checked);
      toast.error("Failed to update acceptance");
    } finally {
      setToggling(false);
    }
  };

  return (
    <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--dim)]">
      Accepted
      <Switch
        checked={accepted}
        onCheckedChange={handleToggle}
        disabled={toggling}
        aria-label="Client accepted"
        className={`${accepted ? 'data-[state=checked]:bg-[var(--ok)]' : 'data-[state=unchecked]:bg-[var(--bad)]'} h-4 w-7 [&>span]:h-3 [&>span]:w-3`}
      />
    </label>
  );
}
