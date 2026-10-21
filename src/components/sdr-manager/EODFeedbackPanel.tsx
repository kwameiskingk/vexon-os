import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { useAuth } from "@/contexts/AuthContext";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle, Smile, Meh, Frown, SmilePlus, Angry, Calendar,
  Phone, Target, Users, TrendingUp, Clock, ChevronRight
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDualTimestamp, useUserTimezone } from "@/utils/timezoneUtils";
import {
  TeamFeedbackFilters,
  FeedbackPeriod,
  getEffectiveRangeStrings,
} from "@/components/feedback/TeamFeedbackFilters";

const moodIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  very_happy: { icon: SmilePlus, color: "text-green-500", label: "Very Happy" },
  happy: { icon: Smile, color: "text-green-400", label: "Happy" },
  neutral: { icon: Meh, color: "text-yellow-500", label: "Neutral" },
  unhappy: { icon: Frown, color: "text-orange-500", label: "Unhappy" },
  very_unhappy: { icon: Angry, color: "text-red-500", label: "Very Unhappy" },
};

interface FeedbackItem {
  id: string;
  setter_id: string;
  date: string;
  mood: string;
  role: string | null;
  meetings_booked_today: number | null;
  emails_sent_today: number | null;
  objections_struggled: string | null;
  training_needed: string | null;
  hit_goal: boolean | null;
  hit_goal_note: string | null;
  anything_else: string | null;
  what_you_did: string | null;
  what_went_well: string | null;
  what_you_struggled_with: string | null;
  challenges: string | null;
  notes: string | null;
}

interface PerformanceData {
  dials_made: number | null;
  dials_target: number | null;
  conversations: number | null;
  meetings_booked: number | null;
  meetings_target: number | null;
  sat_meetings: number | null;
  warm_leads: number | null;
  talk_time: number | null;
  call_duration_seconds: number | null;
  opps_created: number | null;
  conversion_rate: number | null;
}

export const EODFeedbackPanel = () => {
  const { user, userRoles } = useAuth();
  // Person-level surface: the assigned-setter roster unions over every held
  // department.
  const { departments: managerDepartments } = useSdrManagerScope();
  const userTz = useUserTimezone();
  const [period, setPeriod] = useState<FeedbackPeriod>("today");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  // Admin/dev/ops see all setters; SDR managers see only their assigned fulfilment setters
  const hasFullAccess = userRoles.some(r => ['admin', 'dev', 'ops'].includes(r));

  const { data: assignedSetters = [], isLoading: settersLoading } = useQuery({
    queryKey: ['sdr-manager-fulfilment-setters', user?.id, hasFullAccess, managerDepartments.join(",")],
    queryFn: async () => {
      if (!user?.id) return [];

      if (hasFullAccess) {
        const { data: setters } = await supabase
          .from('setters_profiles')
          .select('user_id, full_name, email, department')
          .eq('active', true)
          .neq('department', 'sales'); // AE telemetry rows, not EOD roster members
        return (setters || []).filter(s => s.user_id).map(s => ({
          id: s.user_id!,
          name: s.full_name || s.email || 'Unknown',
          email: s.email || '',
          department: s.department || null,
        }));
      }

      const managedIds = await fetchManagedSetterProfileIds(user.id);
      if (!managedIds.length) return [];
      const { data: setters } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name, email, department')
        .in('id', managedIds)
        .eq('active', true)
        .in('department', managerDepartments);
      return (setters || []).filter(s => s.user_id).map(s => ({
        id: s.user_id!,
        name: s.full_name || s.email || 'Unknown',
        email: s.email || '',
        department: s.department || null,
      }));
    },
    enabled: !!user?.id,
  });

  // Fetch EOD feedback
  const { data: feedback = [], isLoading: feedbackLoading } = useQuery({
    queryKey: ['sdr-manager-eod-feedback', assignedSetters.map(s => s.id).join(','), period, customRange.from?.toISOString(), customRange.to?.toISOString()],
    queryFn: async () => {
      if (!assignedSetters.length) return [];
      const { start, end } = getEffectiveRangeStrings(period, customRange);
      const setterIds = assignedSetters.map(s => s.id);

      const { data, error } = await supabase
        .from('setter_feedback')
        .select('*')
        .in('setter_id', setterIds)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: assignedSetters.length > 0,
  });

  // Fetch performance data for selected feedback
  const { data: performanceData } = useQuery({
    queryKey: ['setter-day-performance', selectedFeedback?.setter_id, selectedFeedback?.date],
    queryFn: async () => {
      if (!selectedFeedback) return null;
      const { data } = await supabase
        .from('performance')
        .select('dials_made, dials_target, conversations, meetings_booked, meetings_target, sat_meetings, warm_leads, talk_time, call_duration_seconds, opps_created, conversion_rate')
        .eq('setter_id', selectedFeedback.setter_id)
        .eq('date', selectedFeedback.date)
        .maybeSingle();
      return data as PerformanceData | null;
    },
    enabled: !!selectedFeedback,
  });

  const filteredFeedback = useMemo(() => {
    const q = search.toLowerCase();
    return feedback.filter((f: any) => {
      if (selectedUserIds.size > 0 && !selectedUserIds.has(f.setter_id)) return false;
      if (q) {
        const name = assignedSetters.find(s => s.id === f.setter_id)?.name || "";
        if (!name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [feedback, selectedUserIds, search, assignedSetters]);

  const getSetterName = (setterId: string) =>
    assignedSetters.find(s => s.id === setterId)?.name || 'Unknown';

  const hasNewSetterResponses = (item: FeedbackItem) =>
    item.role === 'setter' && (
      item.emails_sent_today !== null ||
      !!item.objections_struggled ||
      !!item.training_needed
    );

  const hasLegacySetterResponses = (item: FeedbackItem) =>
    item.role === 'setter' && (
      item.hit_goal !== null ||
      !!item.hit_goal_note ||
      !!item.anything_else
    );

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (settersLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (assignedSetters.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No fulfilment setters assigned to you</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            EOD Feedback — Fulfilment Setters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
          <TeamFeedbackFilters
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            search={search}
            onSearchChange={setSearch}
            users={assignedSetters}
            selectedUserIds={selectedUserIds}
            onUserToggle={toggleUser}
            onUserClear={() => setSelectedUserIds(new Set())}
          />

          {feedbackLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : filteredFeedback.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">
              No EOD submissions found for the selected filters
            </p>
          ) : (
            <div className="space-y-3">
              {filteredFeedback.map((item: any) => {
                const mood = moodIcons[item.mood];
                const MoodIcon = mood?.icon || Meh;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFeedback(item)}
                    className="rounded-lg border border-border p-3 space-y-2 bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{getSetterName(item.setter_id)}</span>
                        <MoodIcon className={cn("h-4 w-4", mood?.color || "text-muted-foreground")} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {item.date}
                          </div>
                          {(item as any).submitted_at_uk || (item as any).submitted_at || (item as any).created_at ? (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDualTimestamp(
                                (item as any).submitted_at_uk || (item as any).submitted_at || (item as any).created_at,
                                userTz
                              )}
                            </span>
                          ) : null}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <Badge variant="outline">Meetings: {item.meetings_booked_today ?? 0}</Badge>
                      <Badge variant="outline">Emails: {item.emails_sent_today ?? 0}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getSetterName(selectedFeedback.setter_id)}
                  <span className="text-xs font-normal text-muted-foreground">— {selectedFeedback.date}</span>
                </DialogTitle>
              </DialogHeader>

              {(() => {
                const mood = moodIcons[selectedFeedback.mood];
                const MoodIcon = mood?.icon || Meh;
                return (
                  <div className="flex items-center gap-2">
                    <MoodIcon className={cn("h-5 w-5", mood?.color || "text-muted-foreground")} />
                    <span className="text-sm font-medium">{mood?.label || selectedFeedback.mood}</span>
                  </div>
                );
              })()}

              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Daily KPI Breakdown
                </h4>
                {performanceData ? (
                  <div className="grid grid-cols-2 gap-2">
                    <KPIStat icon={Phone} label="Dials" value={performanceData.dials_made} target={performanceData.dials_target} />
                    <KPIStat icon={Users} label="Conversations" value={performanceData.conversations} />
                    <KPIStat icon={Target} label="Meetings Booked" value={performanceData.meetings_booked} target={performanceData.meetings_target} />
                    <KPIStat icon={Target} label="Meetings Sat" value={performanceData.sat_meetings} />
                    <KPIStat icon={TrendingUp} label="Warm Leads" value={performanceData.warm_leads} />
                    <KPIStat icon={TrendingUp} label="Opps Created" value={performanceData.opps_created} />
                    <KPIStat icon={Clock} label="Talk Time (min)" value={performanceData.talk_time} />
                    <KPIStat icon={TrendingUp} label="Conversion" value={performanceData.conversion_rate != null ? `${(performanceData.conversion_rate * 100).toFixed(0)}%` : null} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No KPI data recorded for this day</p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  EOD Submission
                </h4>
                <DetailRow label="Meetings booked (self-reported)" value={selectedFeedback.meetings_booked_today ?? 0} />
                {hasNewSetterResponses(selectedFeedback) && (
                  <>
                    <DetailRow label="Emails sent (self-reported)" value={selectedFeedback.emails_sent_today ?? 0} />
                    {selectedFeedback.objections_struggled && (
                      <DetailRow label="Objections struggled with" value={selectedFeedback.objections_struggled} />
                    )}
                    {selectedFeedback.training_needed && (
                      <DetailRow label="Training needed" value={selectedFeedback.training_needed} />
                    )}
                  </>
                )}
                {hasLegacySetterResponses(selectedFeedback) && (
                  <>
                    <DetailRow
                      label="Hit goal"
                      value={selectedFeedback.hit_goal === true ? 'Yes' : selectedFeedback.hit_goal === false ? 'No' : 'No response'}
                    />
                    {selectedFeedback.hit_goal_note && (
                      <DetailRow label="Goal note" value={selectedFeedback.hit_goal_note} />
                    )}
                    {selectedFeedback.anything_else && (
                      <DetailRow label="Anything else" value={selectedFeedback.anything_else} />
                    )}
                  </>
                )}
                {selectedFeedback.what_you_did && (
                  <DetailRow label="What they did" value={selectedFeedback.what_you_did} />
                )}
                {selectedFeedback.what_went_well && (
                  <DetailRow label="What went well" value={selectedFeedback.what_went_well} />
                )}
                {selectedFeedback.what_you_struggled_with && (
                  <DetailRow label="What they struggled with" value={selectedFeedback.what_you_struggled_with} />
                )}
                {selectedFeedback.notes && (
                  <DetailRow label="Notes" value={selectedFeedback.notes} />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const KPIStat = ({
  icon: Icon,
  label,
  value,
  target,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string | null | undefined;
  target?: number | null;
}) => (
  <div className="rounded-lg border border-border bg-muted/30 p-2.5 flex items-start gap-2">
    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">
        {value ?? 0}
        {target != null && <span className="text-xs font-normal text-muted-foreground"> / {target}</span>}
      </p>
    </div>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm">{value}</p>
  </div>
);
