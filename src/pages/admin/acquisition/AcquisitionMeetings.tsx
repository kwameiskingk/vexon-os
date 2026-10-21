import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ButtonV2, Chip, HealthLabel, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { format, isToday, isPast, isFuture } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { CompleteDiscoveryCallDrawer } from "@/components/acquisition/CompleteDiscoveryCallDrawer";
import { formatAppointmentSource } from "@/components/acquisition/AcquisitionMeetingCard";

import { AcquisitionStatusModal } from "@/components/acquisition/AcquisitionStatusModal";
import { AcquisitionMeetingDetailModal } from "@/components/acquisition/AcquisitionMeetingDetailModal";
import { ViewDiscoveryCallDrawer } from "@/components/acquisition/ViewDiscoveryCallDrawer";
import { CreatePitchCallModal } from "@/components/acquisition/CreatePitchCallModal";
import { CompletePitchCallDrawer } from "@/components/acquisition/CompletePitchCallDrawer";
import { bookCandidateSlot } from "@/hooks/useBookingEvent";

type MeetingFilter = 'all' | 'today' | 'upcoming' | 'needs_outcome' | 'completed';
type PitchCallFilter = 'all' | 'today' | 'upcoming' | 'completed';

export default function AcquisitionMeetings() {
  const queryClient = useQueryClient();
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedDiscoveryLog, setSelectedDiscoveryLog] = useState<any>(null);
  const [isSendingContract, setIsSendingContract] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [pitchViewMode, setPitchViewMode] = useState<'card' | 'list'>('card');
  const [isMeetingsOpen, setIsMeetingsOpen] = usePersistedState('acq-meetings-open', true);
  const [isHistoryOpen, setIsHistoryOpen] = usePersistedState('acq-history-open', true);
  const [isPitchCallsOpen, setIsPitchCallsOpen] = usePersistedState('acq-pitch-calls-open', true);
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>('all');
  const [pitchCallFilter, setPitchCallFilter] = useState<PitchCallFilter>('all');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSavingOutcome, setIsSavingOutcome] = useState(false);
  // New state for acquisition status modal, detail modal, and view drawer
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusModalMeeting, setStatusModalMeeting] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailModalMeeting, setDetailModalMeeting] = useState<any>(null);
  const [viewDrawerLog, setViewDrawerLog] = useState<any>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  // Pitch call states
  const [showCreatePitchCallModal, setShowCreatePitchCallModal] = useState(false);
  const [selectedPitchCall, setSelectedPitchCall] = useState<any>(null);
  const [isPitchCallDrawerOpen, setIsPitchCallDrawerOpen] = useState(false);
  const [contractFormData, setContractFormData] = useState({
    client_name: '',
    company_name: '',
    email: '',
    contract_value: '',
    contract_term: ''
  });

  // Fetch acquisition meetings (meetings with department = 'acquisition')
  const {
    data: acquisitionMeetings,
    isLoading: isLoadingMeetings
  } = useQuery({
    queryKey: ['acquisition-meetings'],
    queryFn: async () => {
      const {
        data: meetings,
        error
      } = await supabase.from('meetings').select(`
          *,
          setter_profile:setters_profiles!meetings_setter_profile_id_fkey(
            full_name,
            email
          ),
          assigned_ae_profile:profiles!meetings_assigned_ae_id_fkey(
            full_name,
            email
          )
        `).eq('department', 'acquisition').order('meeting_date', {
        ascending: false
      });
      if (error) throw error;
      return meetings || [];
    }
  });

  // Fetch discovery logs (completed outcomes)
  const {
    data: discoveryLogs,
    isLoading: isLoadingLogs
  } = useQuery({
    queryKey: ['discovery-logs'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('sales_discovery_logs').select('*').order('meeting_at', {
        ascending: false
      });
      if (error) throw error;
      return data;
    }
  });

  // Fetch pitch calls
  const {
    data: pitchCalls,
    isLoading: isLoadingPitchCalls
  } = useQuery({
    queryKey: ['pitch-calls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pitch_calls')
        .select('*')
        .order('pitch_call_date', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch agreement queue status - refetch every 5 seconds to catch webhook updates
  const {
    data: agreementStatuses
  } = useQuery({
    queryKey: ['agreement-statuses'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('agreement_send_queue').select('discovery_log_id, status, sent_at, pandadoc_document_id');
      if (error) throw error;
      const statusMap: Record<string, {
        status: string;
        sent_at: string | null;
        pandadoc_document_id: string | null;
      }> = {};
      data?.forEach(item => {
        if (item.discovery_log_id) {
          statusMap[item.discovery_log_id] = {
            status: item.status || 'pending',
            sent_at: item.sent_at,
            pandadoc_document_id: item.pandadoc_document_id
          };
        }
      });
      return statusMap;
    },
    refetchInterval: 5000 // Poll every 5 seconds to catch callback updates
  });

  // Create a map of meeting_id to discovery_log for quick lookup
  const meetingOutcomeMap = useMemo(() => {
    const map: Record<string, any> = {};
    discoveryLogs?.forEach(log => {
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
    // “Outcome” for filtering = either a discovery log exists OR the attendance was finalized.
    // This prevents meetings from getting stuck in “Needs Outcome” after being marked sat/cancelled/etc.
    return !!meetingOutcomeMap[meeting.id] || isAttendanceFinalized(meeting);
  };

  // Filter meetings based on selected filter
  const filteredMeetings = useMemo(() => {
    if (!acquisitionMeetings) return [];
    return acquisitionMeetings.filter(meeting => {
      const meetingDate = new Date(meeting.meeting_date);
      const hasOutcome = hasOutcomeForFiltering(meeting);
      const isTodayMeeting = isToday(meetingDate);
      const isPastMeeting = isPast(meetingDate) && !isTodayMeeting;
      const isUpcoming = isFuture(meetingDate);
      switch (meetingFilter) {
        case 'today':
          return isTodayMeeting;
        case 'upcoming':
          return isUpcoming;
        case 'needs_outcome':
          return !hasOutcome && (isPastMeeting || isTodayMeeting);
        case 'completed':
          return hasOutcome;
        default:
          return true;
      }
    });
  }, [acquisitionMeetings, meetingFilter, meetingOutcomeMap]);

  // Filter pitch calls based on selected filter
  const filteredPitchCalls = useMemo(() => {
    if (!pitchCalls) return [];
    return pitchCalls.filter(pc => {
      const pitchDate = new Date(pc.pitch_call_date);
      const isTodayCall = isToday(pitchDate);
      const isUpcomingCall = isFuture(pitchDate);
      const isCompletedCall = pc.status === 'completed';

      switch (pitchCallFilter) {
        case 'today':
          return isTodayCall && !isCompletedCall;
        case 'upcoming':
          return isUpcomingCall && !isCompletedCall;
        case 'completed':
          return isCompletedCall;
        default:
          return true;
      }
    });
  }, [pitchCalls, pitchCallFilter]);

  // Count pitch calls for today (for badge)
  const todayPitchCallCount = useMemo(() => {
    if (!pitchCalls) return 0;
    return pitchCalls.filter(pc => 
      isToday(new Date(pc.pitch_call_date)) && pc.status !== 'completed'
    ).length;
  }, [pitchCalls]);

  const deleteLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      await supabase.from('agreement_send_queue').delete().eq('discovery_log_id', logId);
      const {
        error
      } = await supabase.from('sales_discovery_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['discovery-logs']
      });
      queryClient.invalidateQueries({
        queryKey: ['agreement-statuses']
      });
      toast.success('Discovery log deleted');
    },
    onError: error => {
      console.error('Error deleting discovery log:', error);
      toast.error('Failed to delete discovery log');
    }
  });

  const deletePitchCallMutation = useMutation({
    mutationFn: async (pitchCallId: string) => {
      const { error } = await supabase.from('pitch_calls').delete().eq('id', pitchCallId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
      toast.success('Pitch call deleted');
    },
    onError: error => {
      console.error('Error deleting pitch call:', error);
      toast.error('Failed to delete pitch call');
    }
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      // Delete any linked discovery logs first
      await supabase.from('agreement_send_queue').delete().eq('discovery_log_id', meetingId);
      await supabase.from('sales_discovery_logs').delete().eq('meeting_id', meetingId);
      const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acquisition-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-logs'] });
      queryClient.invalidateQueries({ queryKey: ['agreement-statuses'] });
      toast.success('Meeting deleted');
      setShowDetailModal(false);
    },
    onError: error => {
      console.error('Error deleting meeting:', error);
      toast.error('Failed to delete meeting');
    }
  });

  const handleSaveOutcome = async (data: {
    meeting_id: string;
    meeting_status: string;
    attendance_confirmed: boolean;
    team_network_member: boolean;
    contract_value: number | null;
    contract_term: string | null;
    statusData: any;
    feedback: any;
  }) => {
    setIsSavingOutcome(true);
    try {
      const meeting = selectedMeeting;
      if (!meeting) throw new Error('No meeting selected');

      const { data: insertedLog, error } = await supabase.from('sales_discovery_logs').insert({
        meeting_id: data.meeting_id,
        client_name: meeting.company_name,
        client_email: meeting.prospect_email,
        meeting_at: new Date(`${meeting.meeting_date}T${meeting.meeting_time}`).toISOString(),
        attendance_confirmed: data.attendance_confirmed,
        team_network_member: data.team_network_member,
        outcome: data.meeting_status,
        contract_value: data.contract_value,
        contract_term: data.contract_term,
      }).select('id, client_name, meeting_at').single();
      if (error) throw error;

      await supabase.from('meetings').update({
        status: data.meeting_status,
        attendance_status: data.meeting_status,
        // Sat-only: isMeetingSat treats this flag as "prospect attended".
        attendance_confirmed: data.meeting_status === 'sat',
        outcome_confirmed_at: new Date().toISOString(),
      }).eq('id', data.meeting_id);

      // Handle status-specific side effects
      const sd = data.statusData;
      if (sd.status === 'sat_follow_up' && sd.follow_up_date && sd.follow_up_time) {
        const { data: { user } } = await supabase.auth.getUser();
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
          created_by: user?.id,
        });
        queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
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
            .eq('id', meeting.id);
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
                      queryClient.invalidateQueries({ queryKey: ['acquisition-meetings'] });
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

      // Save feedback if provided (sat statuses)
      if (data.feedback && insertedLog) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('post_discovery_feedback').insert({
          discovery_log_id: insertedLog.id,
          ae_user_id: user?.id,
          client_name: meeting.company_name,
          call_date: new Date(`${meeting.meeting_date}T${meeting.meeting_time}`).toISOString(),
          ...data.feedback,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['discovery-logs'] });
      queryClient.invalidateQueries({ queryKey: ['acquisition-meetings'] });
      toast.success('Discovery call outcome saved');
      setIsDrawerOpen(false);
    } catch (error: any) {
      console.error('Error saving outcome:', error);
      toast.error(error.message || 'Failed to save outcome');
    } finally {
      setIsSavingOutcome(false);
    }
  };

  const openContractModal = (log: any) => {
    setSelectedDiscoveryLog(log);
    setContractFormData({
      client_name: log.client_name || '',
      company_name: log.client_name || '',
      email: log.client_email || '',
      contract_value: log.contract_value?.toString() || '',
      contract_term: log.contract_term || ''
    });
    setShowContractModal(true);
  };

  const handleSendContract = async () => {
    if (!contractFormData.client_name || !contractFormData.email || !contractFormData.company_name || !contractFormData.contract_value) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSendingContract(true);
    try {
      const payload = {
        client_name: contractFormData.client_name,
        client_email: contractFormData.email,
        company_name: contractFormData.company_name,
        contract_value: parseFloat(contractFormData.contract_value),
        agreement_date: format(new Date(), 'yyyy-MM-dd'),
        discovery_log_id: selectedDiscoveryLog.id
      };
      const {
        data,
        error
      } = await supabase.functions.invoke('send-pandadoc-agreement', {
        body: payload
      });
      if (error) throw new Error(error.message || 'Failed to send agreement');
      if (!data?.success) throw new Error(data?.error || 'Failed to send agreement');
      toast.success('Agreement sent successfully');
      queryClient.invalidateQueries({
        queryKey: ['discovery-logs']
      });
      queryClient.invalidateQueries({
        queryKey: ['agreement-statuses']
      });
      setShowContractModal(false);
    } catch (error: any) {
      console.error('Error sending agreement:', error);
      toast.error(error.message || 'Failed to send agreement');
    } finally {
      setIsSendingContract(false);
    }
  };

  const getStatusBadge = (logId: string, sentContractAt: string | null) => {
    const agreementStatus = agreementStatuses?.[logId];
    if (!sentContractAt && !agreementStatus) return null;
    const status = agreementStatus?.status || 'pending';
    switch (status) {
      case 'sent':
        return <Pill variant="ok">Sent</Pill>;
      case 'sending':
        return <Pill variant="warn">Sending</Pill>;
      case 'failed':
        return <Pill variant="bad">Failed</Pill>;
      default:
        return <Pill variant="info">Pending</Pill>;
    }
  };

  const isAgreementSent = (logId: string) => {
    const status = agreementStatuses?.[logId]?.status;
    return status === 'sent' || status === 'sending';
  };

  // Handle clicking on Acquisition Meeting - shows detail modal first
  const handleMeetingClick = (meeting: any) => {
    const existingLog = meetingOutcomeMap[meeting.id];
    if (existingLog) {
      // If already has outcome, open view drawer
      setViewDrawerLog(existingLog);
      setIsViewDrawerOpen(true);
    } else {
      // No outcome yet - show detail modal with meeting info
      setDetailModalMeeting(meeting);
      setShowDetailModal(true);
    }
  };

  // When user clicks "Update Status" from detail modal, open the status modal
  const handleOpenStatusFromDetail = () => {
    setStatusModalMeeting(detailModalMeeting);
    setShowStatusModal(true);
  };

  const [outcomeStatusData, setOutcomeStatusData] = useState<any>(null);

  // Handle "Continue to Outcome" from status modal - opens discovery call drawer
  const handleContinueToOutcome = (meeting: any, statusData: any) => {
    setSelectedMeeting({
      ...meeting,
      hasOutcome: false,
      existingOutcome: null
    });
    setOutcomeStatusData(statusData);
    setIsDrawerOpen(true);
  };

  // Handle clicking on Completed Discovery Call - opens view drawer
  const handleDiscoveryLogClick = (log: any) => {
    setViewDrawerLog(log);
    setIsViewDrawerOpen(true);
  };

  // Handle clicking on pitch call
  const handlePitchCallClick = (pitchCall: any) => {
    setSelectedPitchCall(pitchCall);
    setIsPitchCallDrawerOpen(true);
  };

  const needsOutcomeCount = useMemo(() => {
    if (!acquisitionMeetings) return 0;
    return acquisitionMeetings.filter(m => {
      const meetingDate = new Date(m.meeting_date);
      const hasOutcome = hasOutcomeForFiltering(m);
      return !hasOutcome && (isPast(meetingDate) || isToday(meetingDate));
    }).length;
  }, [acquisitionMeetings, meetingOutcomeMap]);

  // ---- Row helpers (15 Oct UI pass: rows, not cards) ----

  const whenRow = (date: string, time?: string | null) =>
    `${format(new Date(`${date}T12:00:00`), 'd MMM')}${time ? ` · ${String(time).slice(0, 5)}` : ''}`;

  const whenFromIso = (iso: string) => `${format(new Date(iso), 'd MMM')} · ${format(new Date(iso), 'HH:mm')}`;

  const interestLabel = (interest: string | null) => {
    switch (interest) {
      case 'interested':
        return <HealthLabel health="ok">Interested</HealthLabel>;
      case 'unsure':
        return <HealthLabel health="warn">Unsure</HealthLabel>;
      case 'not_interested':
        return <HealthLabel health="bad">Not interested</HealthLabel>;
      default:
        return <span className="text-[12.5px] text-[var(--dim)]">{interest || '—'}</span>;
    }
  };

  const outcomeLabel = (outcome: string | null) => {
    if (!outcome) return <span className="text-[12.5px] text-[var(--dim)]">—</span>;
    const health = outcome === 'sat' ? 'ok' : outcome === 'no_show' || outcome === 'cancelled' ? 'bad' : 'warn';
    return <HealthLabel health={health}>{outcome.replace(/_/g, ' ')}</HealthLabel>;
  };

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

  const pitchStatusPill = (pc: { converted_to_client: boolean | null; marked_not_proceeding: boolean | null; status: string | null; pitch_call_date: string }) => {
    if (pc.converted_to_client) return <Pill variant="ok">Converted</Pill>;
    if (pc.marked_not_proceeding) return <Pill variant="bad">Not proceeding</Pill>;
    if (pc.status === 'completed') return <Pill variant="info">Completed</Pill>;
    if (isToday(new Date(pc.pitch_call_date))) return <Pill variant="warn">Today</Pill>;
    return <Pill variant="info">Scheduled</Pill>;
  };

  const deleteAction = (title: string, description: string, onConfirm: () => void) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <ButtonV2 variant="ghost" size="sm" aria-label={title} className="text-[var(--bad)]" onClick={(e) => e.stopPropagation()}>
          <Trash2 className="h-3.5 w-3.5" />
        </ButtonV2>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

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
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'needs_outcome', label: 'Needs outcome' },
    { id: 'completed', label: 'Completed' },
  ];

  const PITCH_FILTERS: { id: PitchCallFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
  ];

  return <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader title="Meetings" subtitle="Manage acquisition discovery calls, pitch calls and outcomes" />
        <div className="space-y-6">

        <StatStrip
          stats={[
            { label: 'Discovery calls', value: acquisitionMeetings?.length ?? 0 },
            { label: 'Needs outcome', value: needsOutcomeCount },
            { label: 'Follow-up calls', value: pitchCalls?.length ?? 0, caption: todayPitchCallCount > 0 ? `${todayPitchCallCount} today` : undefined },
            { label: 'Completed', value: discoveryLogs?.length ?? 0 },
          ]}
        />

        {/* Discovery calls (collapsible, state persisted) */}
        <Collapsible open={isMeetingsOpen} onOpenChange={setIsMeetingsOpen}>
          <Panel
            title="Discovery calls"
            meta={`${filteredMeetings.length} meeting${filteredMeetings.length !== 1 ? 's' : ''}`}
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

              {isLoadingMeetings ? skeletonRows : filteredMeetings.length === 0 ? (
                emptyText(meetingFilter === 'all' ? 'Acquisition meetings will appear here when setters log them.' : 'No meetings match the selected filter.')
              ) : (
                <RowList
                  columns="120px minmax(0,1fr) auto auto"
                  head={['When', 'Prospect', 'Status', <span key="a" className="text-right">Actions</span>]}
                >
                  {filteredMeetings.map((meeting) => {
                    const hasOutcome = !!meetingOutcomeMap[meeting.id];
                    const meetingDate = new Date(meeting.meeting_date);
                    const isTodayMeeting = isToday(meetingDate);
                    const isPastMeeting = isPast(meetingDate) && !isTodayMeeting;
                    const isFinal = isAttendanceFinalized(meeting);
                    const needsOutcome = !hasOutcome && (isPastMeeting || isTodayMeeting) && !isFinal;
                    const rowMeeting = { ...meeting, hasOutcome };
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
                              {meeting.appointment_source && <Pill variant="info">{formatAppointmentSource(meeting.appointment_source)}</Pill>}
                              {meeting.is_rebook && <Pill variant="warn">Rebook</Pill>}
                              {meeting.source_referral_id && <Pill variant="info">Partner referral</Pill>}
                              {meeting.client_confirmed_attendance !== null && meeting.client_confirmed_attendance !== undefined && (
                                <Pill variant={meeting.client_confirmed_attendance ? 'ok' : 'default'} title="Reported by setter on confirmation call">Conf: {meeting.client_confirmed_attendance ? 'Yes' : 'No'}</Pill>
                              )}
                              {meeting.prospect_watched_video !== null && meeting.prospect_watched_video !== undefined && (
                                <Pill variant={meeting.prospect_watched_video ? 'ok' : 'warn'} title="Reported by setter on confirmation call">Video: {meeting.prospect_watched_video ? 'Yes' : 'No'}</Pill>
                              )}
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

        {/* Follow-up (pitch) calls */}
        <Collapsible open={isPitchCallsOpen} onOpenChange={setIsPitchCallsOpen}>
          <Panel
            title="Follow-up calls"
            meta={`${filteredPitchCalls.length} follow-up call${filteredPitchCalls.length !== 1 ? 's' : ''}`}
            aside={
              <div className="flex items-center gap-2">
                {todayPitchCallCount > 0 && <Pill variant="bad">{todayPitchCallCount} today</Pill>}
                <ButtonV2 size="sm" onClick={() => setShowCreatePitchCallModal(true)}>New follow-up call</ButtonV2>
                {collapseToggle(isPitchCallsOpen)}
              </div>
            }
          >
            <CollapsibleContent>
              <div className="flex flex-wrap items-center gap-2 py-3">
                {PITCH_FILTERS.map((f) => (
                  <Chip key={f.id} selected={pitchCallFilter === f.id} onClick={() => setPitchCallFilter(f.id)}>{f.label}</Chip>
                ))}
              </div>

              {isLoadingPitchCalls ? skeletonRows : filteredPitchCalls.length === 0 ? (
                emptyText(pitchCallFilter === 'all' ? 'Set up a follow-up call from a completed discovery call or create one manually.' : 'No follow-up calls match the selected filter.')
              ) : (
                <RowList
                  columns="120px minmax(0,1fr) 130px 90px auto"
                  head={['When', 'Client', 'Interest', <span key="v" className="text-right">Value</span>, <span key="s" className="text-right">Status</span>]}
                >
                  {filteredPitchCalls.map((pc) => (
                    <Row key={pc.id} focus={isToday(new Date(pc.pitch_call_date)) && pc.status !== 'completed'} onClick={() => handlePitchCallClick(pc)}>
                      <RowNum className="text-[var(--dim)]">{whenRow(pc.pitch_call_date, pc.pitch_call_time)}</RowNum>
                      <RowName
                        primary={pc.client_name}
                        secondary={[pc.client_email, (pc.pitch_outcome || pc.original_outcome) ? `outcome ${(pc.pitch_outcome || pc.original_outcome || '').replace(/_/g, ' ')}` : null].filter(Boolean).join(' · ')}
                      />
                      <div>{interestLabel(pc.pitch_interest || pc.original_interest)}</div>
                      <RowNum className="pr-0">£{(pc.contract_value || 0).toLocaleString()}</RowNum>
                      <div className="flex items-center justify-end gap-[5px]">
                        {pitchStatusPill(pc)}
                        {deleteAction('Delete follow-up call?', `This will permanently delete the follow-up call for "${pc.client_name}". This action cannot be undone.`, () => deletePitchCallMutation.mutate(pc.id))}
                      </div>
                    </Row>
                  ))}
                </RowList>
              )}
            </CollapsibleContent>
          </Panel>
        </Collapsible>

        {/* Completed discovery calls */}
        <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <Panel
            title="Completed discovery calls"
            meta={discoveryLogs ? `${discoveryLogs.length} logged` : undefined}
            aside={collapseToggle(isHistoryOpen)}
          >
            <CollapsibleContent>
              {isLoadingLogs ? skeletonRows : !discoveryLogs || discoveryLogs.length === 0 ? (
                emptyText('Complete a discovery call from the meetings above to see it here.')
              ) : (
                <RowList
                  className="pt-2"
                  columns="120px minmax(0,1fr) 130px 90px auto"
                  head={['When', 'Client', 'Outcome', <span key="v" className="text-right">Value</span>, <span key="s" className="text-right">Status</span>]}
                >
                  {discoveryLogs.map((log) => (
                    <Row key={log.id} onClick={() => handleDiscoveryLogClick(log)}>
                      <RowNum className="text-[var(--dim)]">{whenFromIso(log.meeting_at)}</RowNum>
                      <RowName
                        primary={log.client_name}
                        secondary={[
                          log.client_email,
                          log.attendance_confirmed ? 'attendance confirmed' : 'attendance not confirmed',
                          log.client_interest === 'interested' ? 'interested' : log.client_interest === 'unsure' ? 'unsure' : log.client_interest === 'not_interested' ? 'not interested' : null,
                        ].filter(Boolean).join(' · ')}
                      />
                      <div>{outcomeLabel(log.outcome)}</div>
                      <RowNum className="pr-0">£{(log.contract_value || 0).toLocaleString()}</RowNum>
                      <div className="flex items-center justify-end gap-[5px]">
                        {getStatusBadge(log.id, log.sent_contract_at)}
                        {log.converted_to_client && <Pill variant="ok">Converted</Pill>}
                        {log.marked_not_proceeding && <Pill variant="bad">Not proceeding</Pill>}
                        {deleteAction('Delete discovery log?', `This will permanently delete the discovery log for "${log.client_name}". This action cannot be undone.`, () => deleteLogMutation.mutate(log.id))}
                      </div>
                    </Row>
                  ))}
                </RowList>
              )}
            </CollapsibleContent>
          </Panel>
        </Collapsible>

        {/* Complete Discovery Call Drawer */}
        <CompleteDiscoveryCallDrawer
          meeting={selectedMeeting}
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          onSave={handleSaveOutcome}
          isSaving={isSavingOutcome}
          statusData={outcomeStatusData}
        />

        {/* Send Agreement Modal */}
        <Dialog open={showContractModal} onOpenChange={setShowContractModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Agreement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Client Name *</Label>
                <Input required value={contractFormData.client_name} onChange={e => setContractFormData({
                  ...contractFormData,
                  client_name: e.target.value
                })} placeholder="John Smith" />
              </div>
              <div>
                <Label>Company Name *</Label>
                <Input required value={contractFormData.company_name} onChange={e => setContractFormData({
                  ...contractFormData,
                  company_name: e.target.value
                })} placeholder="Acme Corp" />
              </div>
              <div>
                <Label>Client Email *</Label>
                <Input required type="email" value={contractFormData.email} onChange={e => setContractFormData({
                  ...contractFormData,
                  email: e.target.value
                })} placeholder="john@company.com" />
              </div>
              <div>
                <Label>Contract Value (£) *</Label>
                <Input required type="number" value={contractFormData.contract_value} onChange={e => setContractFormData({
                  ...contractFormData,
                  contract_value: e.target.value
                })} placeholder="0.00" />
              </div>
              <div>
                <Label>Contract Term / Notes</Label>
                <Textarea value={contractFormData.contract_term} onChange={e => setContractFormData({
                  ...contractFormData,
                  contract_term: e.target.value
                })} placeholder="12 months, additional terms..." rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <ButtonV2 onClick={() => setShowContractModal(false)} disabled={isSendingContract}>
                Cancel
              </ButtonV2>
              <ButtonV2 variant="primary" onClick={handleSendContract} disabled={isSendingContract}>
                {isSendingContract ? <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </> : 'Send Agreement'}
              </ButtonV2>
            </div>
          </DialogContent>
        </Dialog>


        {/* Meeting Detail Modal - shows full info before status actions */}
        <AcquisitionMeetingDetailModal
          open={showDetailModal}
          onOpenChange={setShowDetailModal}
          meeting={detailModalMeeting}
          onUpdateStatus={handleOpenStatusFromDetail}
          hasOutcome={detailModalMeeting ? !!meetingOutcomeMap[detailModalMeeting.id] : false}
          onDelete={(meetingId) => deleteMeetingMutation.mutate(meetingId)}
        />

        {/* Acquisition Status Modal - for updating meeting status */}
        <AcquisitionStatusModal
          open={showStatusModal}
          onOpenChange={setShowStatusModal}
          meeting={statusModalMeeting}
          onContinueToOutcome={handleContinueToOutcome}
        />

        {/* View Discovery Call Drawer - for viewing completed discovery calls */}
        <ViewDiscoveryCallDrawer
          log={viewDrawerLog}
          open={isViewDrawerOpen}
          onOpenChange={setIsViewDrawerOpen}
          onSendAgreement={(log) => openContractModal(log)}
          isAgreementSent={viewDrawerLog ? isAgreementSent(viewDrawerLog.id) : false}
          agreementStatus={viewDrawerLog ? agreementStatuses?.[viewDrawerLog.id] : null}
        />

        {/* Create Pitch Call Modal */}
        <CreatePitchCallModal
          open={showCreatePitchCallModal}
          onOpenChange={setShowCreatePitchCallModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
          }}
        />

        {/* Complete Pitch Call Drawer */}
        <CompletePitchCallDrawer
          pitchCall={selectedPitchCall}
          open={isPitchCallDrawerOpen}
          onOpenChange={setIsPitchCallDrawerOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
            setIsPitchCallDrawerOpen(false);
          }}
        />
        </div>
      </PageContainer>
    </DashboardLayout>;
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
