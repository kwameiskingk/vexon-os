import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isToday, isPast, isFuture } from "date-fns";
import { Calendar, User, Building, Check, CheckCircle2, Clock, X, XCircle, Users, DollarSign, Handshake, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Meeting {
  id: string;
  company_name: string;
  prospect_name: string;
  prospect_email: string;
  meeting_date: string;
  meeting_time: string;
  status: string | null;
  attendance_status?: string | null;
  company_headcount?: string | null;
  revenue_last_12_months?: string | null;
  accepted_by_client?: boolean | null;
  client_confirmed_attendance?: boolean | null;
  prospect_watched_video?: boolean | null;
  setter_profile?: {
    full_name: string | null;
    email: string;
  } | null;
  assigned_ae_profile?: {
    full_name: string | null;
    email: string;
  } | null;
  hasOutcome?: boolean;
  is_rebook?: boolean | null;
  appointment_source?: string | null;
  source_referral_id?: string | null;
}

// Local shape for acq_qual_scores rows — the table is live in the DB but
// missing from the stale generated types.ts, so callers query it with the
// house `as any` cast pattern and hand rows to this interface.
export interface AcqQualScore {
  id: string;
  // Nullable since the scoring trigger moved off Vexon OS's meetings table onto
  // Close-native signals: those rows are keyed by (lead_id, call_date) instead
  // and carry no meeting_id until acq-meetings-today backfills one.
  meeting_id: string | null;
  lead_id: string | null;
  call_id: string | null;
  status: "scored" | "no_transcript" | "dq_health" | string;
  gate_revenue: boolean | null;
  gate_revenue_evidence: string | null;
  gate_tam: boolean | null;
  gate_tam_evidence: string | null;
  gate_urgency: boolean | null;
  gate_urgency_evidence: string | null;
  gate_decision_maker: boolean | null;
  gate_decision_maker_evidence: string | null;
  gate_educated: boolean | null;
  gate_educated_evidence: string | null;
  gates_hit: number | null;
  health_flag: boolean;
  health_flag_reason: string | null;
  info_headcount: string | null;
  info_prior_leadgen: string | null;
  info_years_in_business: string | null;
  reviewer_notes: string | null;
  recording_url: string | null;
  setter_name: string | null;
  call_date: string | null;
}

export const ACQ_QUAL_GATES: { key: keyof AcqQualScore; evidenceKey: keyof AcqQualScore; label: string }[] = [
  { key: "gate_revenue", evidenceKey: "gate_revenue_evidence", label: "Revenue > £500k" },
  { key: "gate_tam", evidenceKey: "gate_tam_evidence", label: "TAM > 1,000 companies" },
  { key: "gate_urgency", evidenceKey: "gate_urgency_evidence", label: "Ready to decide now" },
  { key: "gate_decision_maker", evidenceKey: "gate_decision_maker_evidence", label: "Decision maker" },
  { key: "gate_educated", evidenceKey: "gate_educated_evidence", label: "Advised to watch video" },
];

const APPOINTMENT_SOURCE_LABELS: Record<string, string> = {
  cold_call: "Cold Call",
  cold_email: "Cold Email",
  linkedin: "LinkedIn",
  ads: "Ads",
};

export function formatAppointmentSource(value?: string | null): string | null {
  if (!value) return null;
  return APPOINTMENT_SOURCE_LABELS[value] || value;
}

interface AcquisitionMeetingCardProps {
  meeting: Meeting;
  onComplete: (meeting: Meeting) => void;
  /** Qualification score for this meeting (acq surfaces only). No row = render nothing — scoring runs end-of-day. */
  qualScore?: AcqQualScore;
}

function qualBadgeClasses(gatesHit: number): string {
  if (gatesHit === 5) return "border-green-500/50 text-green-600 dark:text-green-400";
  if (gatesHit >= 3) return "border-amber-500/60 text-amber-600 dark:text-amber-400";
  return "border-red-500/60 text-red-600 dark:text-red-400";
}

function QualScoreBadge({ qualScore }: { qualScore: AcqQualScore }) {
  let badge: JSX.Element;
  if (qualScore.status === "scored") {
    const n = qualScore.gates_hit ?? 0;
    badge = (
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 cursor-pointer ${qualBadgeClasses(n)}`}
        title="Qualification gates hit on the booking call"
      >
        {n}/5 qualified
      </Badge>
    );
  } else if (qualScore.status === "dq_health") {
    badge = (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 cursor-pointer border-muted-foreground/40 text-muted-foreground"
        title="Policy disqualification — healthcare/NHS prospect; setter not penalised"
      >
        DQ — Health
      </Badge>
    );
  } else {
    badge = (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 cursor-pointer border-muted-foreground/40 text-muted-foreground"
        title="No call transcript was available to score"
      >
        No transcript
      </Badge>
    );
  }

  const infoRows = [
    { label: "Headcount", value: qualScore.info_headcount },
    { label: "Prior lead gen", value: qualScore.info_prior_leadgen },
    { label: "Years in business", value: qualScore.info_years_in_business },
  ].filter((r) => r.value);

  return (
    // Card root has onClick — stop propagation like the Accepted switch wrapper below.
    <span onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger asChild>{badge}</PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-2">
            <div className="space-y-1.5">
              {ACQ_QUAL_GATES.map((g) => {
                const hit = qualScore[g.key];
                const evidence = qualScore[g.evidenceKey] as string | null;
                return (
                  <div key={g.key} className="text-sm">
                    <div className="flex items-center gap-2">
                      {hit === true ? (
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : hit === false ? (
                        <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <span className="w-4 text-center text-muted-foreground flex-shrink-0">—</span>
                      )}
                      <span>{g.label}</span>
                    </div>
                    {evidence && (
                      <p className="ml-6 text-xs text-muted-foreground">“{evidence}”</p>
                    )}
                  </div>
                );
              })}
            </div>
            {infoRows.length > 0 && (
              <div className="pt-2 border-t border-border space-y-0.5">
                {infoRows.map((r) => (
                  <div key={r.label} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.label}:</span> {r.value}
                  </div>
                ))}
              </div>
            )}
            {qualScore.status === "dq_health" && qualScore.health_flag_reason && (
              <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Health DQ:</span> {qualScore.health_flag_reason}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function AcquisitionMeetingCard({ meeting, onComplete, qualScore }: AcquisitionMeetingCardProps) {
  const [accepted, setAccepted] = useState(!!meeting.accepted_by_client);
  const [toggling, setToggling] = useState(false);

  const meetingDate = new Date(meeting.meeting_date);
  const isUpcoming = isFuture(meetingDate);
  const isTodayMeeting = isToday(meetingDate);
  const isPastMeeting = isPast(meetingDate) && !isTodayMeeting;

  const getTimingBadge = () => {
    if (isTodayMeeting) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">Today</Badge>;
    }
    if (isUpcoming) {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Upcoming</Badge>;
    }
    if (isPastMeeting) {
      return <Badge className="bg-muted text-muted-foreground border-border">Past</Badge>;
    }
    return null;
  };

  const getStatusBadge = () => {
    if (meeting.hasOutcome) {
      return (
        <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
          Completed
        </Badge>
      );
    }

    const effectiveStatus = meeting.attendance_status || meeting.status;

    switch (effectiveStatus) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Approved</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case 'sat':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Sat</Badge>;
      case 'no_show':
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">No Show</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground border-border">Cancelled</Badge>;
      case 'rescheduled':
        return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">Rescheduled</Badge>;
      default:
        return null;
    }
  };

  const handleToggleAccepted = async (checked: boolean) => {
    setToggling(true);
    setAccepted(checked);
    try {
      const updatePayload: any = { 
        accepted_by_client: checked,
        client_accepted: checked,
      };
      if (checked) {
        updatePayload.status = "client_accepted";
      }
      const { error } = await supabase
        .from("meetings")
        .update(updatePayload)
        .eq("id", meeting.id);
      if (error) throw error;
      toast.success(checked ? "Client accepted" : "Client acceptance removed");
    } catch (err) {
      setAccepted(!checked); // revert
      toast.error("Failed to update acceptance");
    } finally {
      setToggling(false);
    }
  };

  const effectiveStatus = meeting.attendance_status || meeting.status;
  const isFinalAttendance = ['sat', 'no_show', 'cancelled', 'rescheduled'].includes(effectiveStatus || '');
  const needsOutcome = !meeting.hasOutcome && (isPastMeeting || isTodayMeeting) && !isFinalAttendance;

  return (
    <Card 
      className={`bg-card border-border transition-all hover:border-primary/50 cursor-pointer ${
        meeting.prospect_watched_video === false
          ? 'ring-1 ring-amber-500/60 border-amber-500/40'
          : needsOutcome ? 'ring-1 ring-primary/30' : ''
      }`}
      onClick={() => onComplete(meeting)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <CardTitle className="text-base truncate">{meeting.company_name}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {meeting.appointment_source && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-primary/40 text-primary"
                title="Source of appointment"
              >
                <Megaphone className="h-2.5 w-2.5 mr-1" />
                {formatAppointmentSource(meeting.appointment_source)}
              </Badge>
            )}
            {meeting.is_rebook && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-500">Rebook</Badge>
            )}
            {meeting.source_referral_id && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-primary/40 text-primary"
                title="Converted from a partner referral"
              >
                <Handshake className="h-2.5 w-2.5 mr-1" />
                Partner Referral
              </Badge>
            )}
            {meeting.client_confirmed_attendance !== null && meeting.client_confirmed_attendance !== undefined && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${meeting.client_confirmed_attendance ? 'border-green-500/50 text-green-600 dark:text-green-400' : 'border-muted-foreground/40 text-muted-foreground'}`}
                title="Reported by setter on confirmation call"
              >
                Conf: {meeting.client_confirmed_attendance ? 'Yes' : 'No'}
              </Badge>
            )}
            {meeting.prospect_watched_video !== null && meeting.prospect_watched_video !== undefined && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${meeting.prospect_watched_video ? 'border-green-500/50 text-green-600 dark:text-green-400' : 'border-amber-500/60 text-amber-600 dark:text-amber-400'}`}
                title="Reported by setter on confirmation call"
              >
                Video: {meeting.prospect_watched_video ? 'Yes' : 'No'}
              </Badge>
            )}
            {qualScore && <QualScoreBadge qualScore={qualScore} />}
            {getTimingBadge()}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{meeting.prospect_name}</span>
              <span className="text-muted-foreground truncate">• {meeting.prospect_email}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>{format(meetingDate, 'PPP')}</span>
              <span className="text-muted-foreground">at {meeting.meeting_time}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 text-xs flex-shrink-0">
            {meeting.company_headcount && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{meeting.company_headcount}</span>
              </div>
            )}
            {meeting.revenue_last_12_months && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                <span>{meeting.revenue_last_12_months}</span>
              </div>
            )}
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-muted-foreground text-[11px]">Accepted</span>
              <Switch
                checked={accepted}
                onCheckedChange={handleToggleAccepted}
                disabled={toggling}
                className={`${accepted ? 'data-[state=checked]:bg-green-500' : 'data-[state=unchecked]:bg-red-400'} h-4 w-7 [&>span]:h-3 [&>span]:w-3`}
              />
            </div>
          </div>
        </div>

        {(meeting.setter_profile || meeting.assigned_ae_profile) && (
          <div className="text-xs text-muted-foreground pt-1 border-t border-border space-y-0.5">
            {meeting.setter_profile && (
              <div>Logged by: {meeting.setter_profile.full_name || meeting.setter_profile.email}</div>
            )}
            {meeting.assigned_ae_profile && (
              <div>Meeting for: {meeting.assigned_ae_profile.full_name || meeting.assigned_ae_profile.email}</div>
            )}
          </div>
        )}

        {needsOutcome && (
          <Button 
            size="sm" 
            className="w-full mt-2"
            onClick={(e) => {
              e.stopPropagation();
              onComplete(meeting);
            }}
          >
            Complete Discovery Call
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
