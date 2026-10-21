import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Clock, User, Building2, CheckCircle, AlertCircle, ChevronRight, CalendarDays, ArrowUpRight, Ban, Phone, FileText, Download, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, startOfDay, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getLeadTypeConfig } from "@/lib/leadTypes";
import { Separator } from "@/components/ui/separator";
import { PendingFeedbackModal } from "@/components/client/PendingFeedbackModal";

// Small helper row used inside the redesigned meeting detail modal
const DetailRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className={`text-sm font-medium break-words ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</p>
  </div>
);

// Renders terms_fees that may be a plain string or a JSON-encoded array of {type,content}
const renderTermsFees = (raw: any): string => {
  if (raw == null) return '';
  if (typeof raw !== 'string') {
    try {
      if (Array.isArray(raw)) {
        return raw.map((x: any) => (typeof x === 'string' ? x : x?.content ?? '')).filter(Boolean).join('\n\n');
      }
      return String(raw);
    } catch { return String(raw); }
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((x: any) => (typeof x === 'string' ? x : x?.content ?? '')).filter(Boolean).join('\n\n');
      }
      if (parsed && typeof parsed === 'object' && 'content' in parsed) return String((parsed as any).content);
    } catch { /* fall through */ }
  }
  return raw;
};


export interface ClientMeetingsViewProps {
  upcomingMeetings: any[];
  pendingMeetings: any[];
  satHistoryMeetings: any[];
  declinedMeetings: any[];
  meetingDates: Date[];
  meetingCountByDate: Map<string, number>;
  selectedDate: Date | undefined;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  selectedDateMeetings: any[];
  selectedMeeting: any;
  showDetailModal: boolean;
  setShowDetailModal: React.Dispatch<React.SetStateAction<boolean>>;
  showFeedbackModal: boolean;
  setShowFeedbackModal: React.Dispatch<React.SetStateAction<boolean>>;
  feedbackMeeting: any;
  setFeedbackMeeting: React.Dispatch<React.SetStateAction<any>>;
  openMeetingDetail: (meeting: any) => void;
  handleDownloadJobSpec: (spec: any) => Promise<void>;
  loadMeetings: () => Promise<void>;
}

export const ClientMeetingsView = (props: ClientMeetingsViewProps) => {
  const {
    upcomingMeetings,
    pendingMeetings,
    satHistoryMeetings,
    declinedMeetings,
    meetingDates,
    meetingCountByDate,
    selectedDate,
    setSelectedDate,
    selectedDateMeetings,
    selectedMeeting,
    showDetailModal,
    setShowDetailModal,
    showFeedbackModal,
    setShowFeedbackModal,
    feedbackMeeting,
    setFeedbackMeeting,
    openMeetingDetail,
    handleDownloadJobSpec,
    loadMeetings,
  } = props;

  // UI-only state local to the view
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("upcoming");

  const getStatusBadge = (meeting: any) => {
    if (meeting.status === 'client_rejected') {
      return <Badge variant="destructive">Declined</Badge>;
    }
    if (meeting.attendance_status === 'cancelled') {
      return <Badge variant="secondary">Cancelled</Badge>;
    }
    if (meeting.attendance_status === 'sat') {
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Sat</Badge>;
    }
    if (meeting.attendance_status === 'no_show') {
      return <Badge variant="destructive">No Show</Badge>;
    }
    if (meeting.attendance_status === 'rescheduled') {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Rescheduled</Badge>;
    }
    // 11 Sep (the owner): approval happens on our side before a meeting is ever
    // shown here, so the client never sees "pending review" / "confirmed".
    // A meeting they can see is simply booked.
    return <Badge variant="outline">Booked</Badge>;
  };


  const MeetingRow = ({ meeting, mode }: { meeting: any; mode?: "feedback" }) => {
    const meetingDate = new Date(meeting.meeting_date);

    const handleClick = () => {
      if (mode === "feedback") {
        setFeedbackMeeting(meeting);
        setShowFeedbackModal(true);
      } else {
        openMeetingDetail(meeting);
      }
    };

    return (
      <div
        className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
        onClick={handleClick}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="hidden sm:flex h-12 w-12 rounded-lg bg-primary/10 items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-foreground truncate">{meeting.company_name}</h4>
              {(() => {
                const lt = meeting.lead_type;
                if (lt === 'mobile_phone_call' || lt === 'terms_sent') {
                  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10"><Phone className="h-3 w-3 mr-0.5" />Callback</Badge>;
                }
                const ltc = getLeadTypeConfig(lt); const LtIcon = ltc.icon;
                return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ltc.color}`}><LtIcon className="h-3 w-3 mr-0.5" />{ltc.label}</Badge>;
              })()}
              {getStatusBadge(meeting)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {meeting.prospect_name}
              </span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(meetingDate, "dd MMM yyyy")}
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {meeting.meeting_time?.slice(0, 5)}
              </span>
              {meeting.created_at && (
                <span className="text-[11px] opacity-70">
                  · Logged {format(new Date(meeting.created_at), "dd MMM")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {meeting.google_meet_link && mode !== "feedback" && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden sm:flex"
              onClick={(e) => e.stopPropagation()}
            >
              <a href={meeting.google_meet_link} target="_blank" rel="noopener noreferrer">
                <Video className="h-4 w-4 mr-1" />
                Join
              </a>
            </Button>
          )}
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    );
  };

  const EmptyState = ({ type }: { type: "pending" | "upcoming" | "sat_history" | "declined" }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        {type === "pending" ? (
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        ) : type === "upcoming" ? (
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
        ) : type === "declined" ? (
          <Ban className="h-8 w-8 text-muted-foreground" />
        ) : (
          <CheckCircle className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <h3 className="font-semibold text-lg mb-1">
        {type === "pending"
          ? "No meetings awaiting feedback"
          : type === "upcoming"
          ? "No upcoming meetings"
          : type === "declined"
          ? "No declined meetings"
          : "No sat meetings yet"}
      </h3>
      <p className="text-muted-foreground text-sm max-w-sm">
        {type === "pending"
          ? "Once a meeting time has passed, it'll show up here for your feedback."
          : type === "upcoming"
          ? "Your upcoming meetings will appear here."
          : type === "declined"
          ? "Meetings marked as not sat will appear here."
          : "Meetings you've confirmed as sat will appear here."}
      </p>
    </div>
  );


  // Custom calendar day renderer with meeting count
  const CalendarDayContent = ({ date, ...props }: { date: Date; displayMonth: Date }) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const count = meetingCountByDate.get(dateKey) || 0;

    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {date.getDate()}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
            {count}
          </span>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Qualified Meetings</h1>
            <p className="text-muted-foreground">View and manage your qualified meetings</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowCalendarModal(true)}
            className="flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            Calendar View
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="upcoming" className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Upcoming
              {upcomingMeetings.length > 0 && (
                <span className="ml-1 bg-emerald-500/20 text-emerald-600 text-xs px-1.5 py-0.5 rounded-full">
                  {upcomingMeetings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Pending Feedback
              {pendingMeetings.length > 0 && (
                <span className="ml-1 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full">
                  {pendingMeetings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sat_history" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Sat
            </TabsTrigger>
            <TabsTrigger value="declined" className="flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Declined
            </TabsTrigger>
          </TabsList>


          <TabsContent value="pending" className="space-y-3">
            {pendingMeetings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Heads up — meetings left without feedback for <strong>12 hours</strong> after the scheduled time are automatically marked as <strong>Sat</strong>. Submit feedback below to override.
                </span>
              </div>
            )}
            {pendingMeetings.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-0">
                  <EmptyState type="pending" />
                </CardContent>
              </Card>
            ) : (
              pendingMeetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} mode="feedback" />
              ))
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-3">
            {upcomingMeetings.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-0">
                  <EmptyState type="upcoming" />
                </CardContent>
              </Card>
            ) : (
              upcomingMeetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} />
              ))
            )}
          </TabsContent>

          <TabsContent value="sat_history" className="space-y-3">
            {satHistoryMeetings.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-0">
                  <EmptyState type="sat_history" />
                </CardContent>
              </Card>
            ) : (
              satHistoryMeetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} />
              ))
            )}
          </TabsContent>

          <TabsContent value="declined" className="space-y-3">
            {declinedMeetings.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-0">
                  <EmptyState type="declined" />
                </CardContent>
              </Card>
            ) : (
              declinedMeetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Calendar View Modal */}
        <Dialog open={showCalendarModal} onOpenChange={setShowCalendarModal}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Lead Calendar
              </DialogTitle>
              <DialogDescription>
                Click on a date to see your qualified leads
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className={cn("p-3 pointer-events-auto rounded-md border")}
                  modifiers={{
                    hasMeeting: meetingDates
                  }}
                  modifiersClassNames={{
                    hasMeeting: "bg-primary/20 text-primary font-semibold"
                  }}
                  components={{
                    DayContent: CalendarDayContent
                  }}
                />
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">
                  {selectedDate
                    ? format(selectedDate, "EEEE, MMMM d, yyyy")
                    : "Select a date to view qualified leads"}
                </h4>

                {selectedDate && selectedDateMeetings.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No qualified leads on this date
                  </div>
                )}

                {selectedDateMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setShowCalendarModal(false);
                      openMeetingDetail(meeting);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">{meeting.company_name}</span>
                      {getStatusBadge(meeting)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {meeting.meeting_time?.slice(0, 5)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {meeting.prospect_name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Meeting Detail Modal — Premium client-facing UI */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
            {selectedMeeting && (
              <>
                {/* Hero header with gradient accent */}
                <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-b border-border px-6 pt-6 pb-5">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.12),transparent_60%)] pointer-events-none" />
                  <DialogHeader className="relative space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-xl font-semibold tracking-tight truncate">
                          {selectedMeeting.company_name}
                        </DialogTitle>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {format(new Date(selectedMeeting.meeting_date), "EEE, dd MMM yyyy")}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {selectedMeeting.meeting_time?.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DialogDescription className="sr-only">
                      Qualified lead details for {selectedMeeting.company_name}
                    </DialogDescription>
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(selectedMeeting)}
                      {(() => {
                        const lt = selectedMeeting.lead_type;
                        if (lt === 'mobile_phone_call') {
                          return <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10"><Phone className="h-3 w-3 mr-1" />Job Spec + Callback</Badge>;
                        }
                        if (lt === 'terms_sent') {
                          return <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/10"><FileText className="h-3 w-3 mr-1" />Terms Sent + Callback</Badge>;
                        }
                        const ltc = getLeadTypeConfig(lt); const LtIcon = ltc.icon;
                        return <Badge variant="outline" className={ltc.color}><LtIcon className="h-3 w-3 mr-1" />{ltc.label}</Badge>;
                      })()}
                    </div>
                  </DialogHeader>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Two-column info grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Prospect card */}
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prospect</h4>
                      </div>
                      <DetailRow label="Name" value={selectedMeeting.prospect_name} />
                      {selectedMeeting.prospect_job_title && (
                        <DetailRow label="Title" value={selectedMeeting.prospect_job_title} />
                      )}
                      {selectedMeeting.prospect_mobile && (
                        <DetailRow label="Mobile" value={selectedMeeting.prospect_mobile} mono />
                      )}
                      <DetailRow label="Email" value={selectedMeeting.prospect_email} mono />
                    </div>

                    {/* Company card */}
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</h4>
                      </div>
                      <DetailRow label="Name" value={selectedMeeting.company_name} />
                      {selectedMeeting.company_website && (
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Website</p>
                          <a href={selectedMeeting.company_website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                            {selectedMeeting.company_website}
                          </a>
                        </div>
                      )}
                      {selectedMeeting.currently_hiring !== null && selectedMeeting.currently_hiring !== undefined && (
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Currently Hiring</p>
                          <Badge variant="outline" className={selectedMeeting.currently_hiring ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10 mt-0.5" : "border-muted text-muted-foreground mt-0.5"}>
                            {selectedMeeting.currently_hiring ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Roles hiring for — full width */}
                  {Array.isArray((selectedMeeting as any).job_roles) && (selectedMeeting as any).job_roles.length > 0 && (
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Roles Hiring For</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {((selectedMeeting as any).job_roles as Array<any>).map((r, i) => {
                          const title = typeof r === 'string' ? r : (r?.title ?? '');
                          const salary = typeof r === 'object' && r ? r.salary : null;
                          const currency = typeof r === 'object' && r ? (r.currency ?? 'GBP') : 'GBP';
                          if (!title) return null;
                          const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
                          return (
                            <div key={i} className="rounded-lg border border-border bg-background/60 px-3 py-2.5 flex items-center justify-between gap-3">
                              <span className="font-medium text-sm truncate">{title}</span>
                              {salary !== null && salary !== undefined && salary !== '' && (
                                <span className="text-xs font-semibold text-primary shrink-0 tabular-nums">
                                  {typeof salary === 'number' ? `${sym}${salary.toLocaleString()}` : String(salary)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedMeeting.next_job_title && !(Array.isArray((selectedMeeting as any).job_roles) && (selectedMeeting as any).job_roles.length > 0) && (
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Hiring For</p>
                      <p className="font-medium">{selectedMeeting.next_job_title}</p>
                    </div>
                  )}

                  {/* Job Spec section — Job Spec + Callback */}
                  {selectedMeeting.lead_type === 'mobile_phone_call' && Array.isArray(selectedMeeting.job_specs) && (selectedMeeting.job_specs as any[]).length > 0 && (
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <FileText className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Job Specifications</h4>
                      </div>
                      <div className="space-y-2">
                        {(selectedMeeting.job_specs as any[]).map((spec: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border bg-background/60 p-3">
                            {spec.type === 'text' ? (
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{spec.content}</p>
                            ) : (
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium truncate">{spec.file_name || 'Document'}</span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={() => handleDownloadJobSpec(spec)}
                                >
                                  <Download className="h-3.5 w-3.5 mr-1.5" />
                                  Download
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Terms & Fees section */}
                  {selectedMeeting.lead_type === 'terms_sent' && selectedMeeting.terms_fees && (
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <FileText className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terms & Fee Details</h4>
                      </div>
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderTermsFees(selectedMeeting.terms_fees)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sticky footer */}
                <div className="border-t border-border bg-muted/20 px-6 py-3 flex gap-2">
                  {selectedMeeting.google_meet_link && (
                    <Button asChild className="flex-1">
                      <a href={selectedMeeting.google_meet_link} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-2" />
                        Join the meeting
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" className="ml-auto" onClick={() => setShowDetailModal(false)}>
                    Close
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>


        <PendingFeedbackModal
          open={showFeedbackModal}
          onOpenChange={setShowFeedbackModal}
          meeting={feedbackMeeting}
          onSuccess={loadMeetings}
        />
      </PageContainer>
    </DashboardLayout>
  );
};


const ClientMeetings = () => {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [clientProfileId, setClientProfileId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackMeeting, setFeedbackMeeting] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: linkedProfiles } = await supabase
      .from("client_profile_users")
      .select("client_profile_id")
      .eq("user_id", user.id);

    const { data: directProfile } = await supabase
      .from("client_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const allProfileIds = new Set<string>();
    linkedProfiles?.forEach(p => allProfileIds.add(p.client_profile_id));
    if (directProfile) allProfileIds.add(directProfile.id);

    const profileIdsArray = Array.from(allProfileIds);
    setClientProfileId(profileIdsArray[0] || null);

    if (profileIdsArray.length === 0) {
      setMeetings([]);
      return;
    }

    // Only fetch meetings that have been approved by admin/CSM/SDR manager
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .in("client_profile_id", profileIdsArray)
      .eq("approved_by_admin", true)
      .order("meeting_date", { ascending: false });

    if (error) {
      toast.error("Failed to load qualified leads");
      setMeetings([]);
      return;
    }

    // The 12-hour "no feedback → sat" rule runs on the server every hour
    // since 11 Sep (auto-sat-no-feedback), so it no longer depends on the
    // client opening this page.

    setMeetings(data || []);
  };

  const today = startOfDay(new Date());
  const now = new Date();

  // Helper: compute meeting datetime
  const meetingDateTime = (m: any) => {
    const t = (m.meeting_time || "00:00:00").slice(0, 8);
    return new Date(`${m.meeting_date}T${t}`);
  };

  // Upcoming: meeting time has not passed by 1h yet, not sat/cancelled/declined, no feedback
  const upcomingMeetings = meetings.filter((m) => {
    if (m.attendance_status === 'sat' || m.attendance_status === 'cancelled') return false;
    if (m.status === 'client_rejected') return false;
    if (m.client_feedback_submitted_at) return false;
    const oneHourAfter = new Date(meetingDateTime(m).getTime() + 60 * 60 * 1000);
    return now < oneHourAfter;
  });

  // Pending Feedback: 1h has passed since meeting, no feedback submitted yet, not sat/cancelled/declined
  const pendingMeetings = meetings.filter((m) => {
    if (m.attendance_status === 'sat' || m.attendance_status === 'cancelled') return false;
    if (m.status === 'client_rejected') return false;
    if (m.client_feedback_submitted_at) return false;
    const oneHourAfter = new Date(meetingDateTime(m).getTime() + 60 * 60 * 1000);
    return now >= oneHourAfter;
  });

  // Sat: meetings that have been sat
  const satHistoryMeetings = meetings.filter((m) => {
    return m.attendance_status === 'sat' || m.client_feedback_sat === true;
  });

  // Declined: meetings the client has declined (incl. via feedback "not sat")
  const declinedMeetings = meetings.filter((m) => {
    return m.status === 'client_rejected' || m.client_feedback_sat === false;
  });


  // Build a map of meeting counts per date for calendar indicators
  const meetingCountByDate = new Map<string, number>();
  meetings
    .filter(m => m.status !== 'client_rejected' && m.attendance_status !== 'cancelled')
    .forEach(m => {
      const dateKey = m.meeting_date;
      meetingCountByDate.set(dateKey, (meetingCountByDate.get(dateKey) || 0) + 1);
    });

  // Get dates that have meetings for calendar highlighting
  const meetingDates = meetings
    .filter(m => m.status !== 'client_rejected' && m.attendance_status !== 'cancelled')
    .map(m => startOfDay(parseISO(m.meeting_date)));

  // Get meetings for selected date
  const selectedDateMeetings = selectedDate
    ? meetings.filter(m => {
        const meetingDate = startOfDay(parseISO(m.meeting_date));
        return meetingDate.getTime() === selectedDate.getTime() &&
               m.status !== 'client_rejected' &&
               m.attendance_status !== 'cancelled';
      })
    : [];


  const openMeetingDetail = (meeting: any) => {
    setSelectedMeeting(meeting);
    setShowDetailModal(true);
  };


  // Download a job spec file (opens direct URLs, otherwise fetches from storage)
  const handleDownloadJobSpec = async (spec: any) => {
    if (spec.file_url) { window.open(spec.file_url, '_blank'); return; }
    const { data } = await supabase.storage.from('job-spec-files').download(spec.content);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = spec.file_name || 'document';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <ClientMeetingsView
      upcomingMeetings={upcomingMeetings}
      pendingMeetings={pendingMeetings}
      satHistoryMeetings={satHistoryMeetings}
      declinedMeetings={declinedMeetings}
      meetingDates={meetingDates}
      meetingCountByDate={meetingCountByDate}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      selectedDateMeetings={selectedDateMeetings}
      selectedMeeting={selectedMeeting}
      showDetailModal={showDetailModal}
      setShowDetailModal={setShowDetailModal}
      showFeedbackModal={showFeedbackModal}
      setShowFeedbackModal={setShowFeedbackModal}
      feedbackMeeting={feedbackMeeting}
      setFeedbackMeeting={setFeedbackMeeting}
      openMeetingDetail={openMeetingDetail}
      handleDownloadJobSpec={handleDownloadJobSpec}
      loadMeetings={loadMeetings}
    />
  );
};

export default ClientMeetings;
