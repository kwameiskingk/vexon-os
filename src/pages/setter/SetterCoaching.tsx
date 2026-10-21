import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { ButtonV2, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { format, isFuture, isToday } from "date-fns";
import { toast } from "sonner";

export interface SetterCoachingProfile {
  id: string;
  status?: string | null;
  current_coaching_focus?: string | null;
  full_name?: string | null;
  title?: string | null;
  per_meeting_bonus?: number | null;
  department?: string | null;
}

export interface CoachingPip {
  id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  target_metrics: unknown;
  status: string | null;
}

export interface CoachingSession {
  id: string;
  session_date: string;
  session_time: string | null;
  session_type: string;
  custom_session_label: string | null;
  status: string | null;
  action_items: string[] | null;
  improvements: string | null;
  observations: string | null;
  agenda: string | null;
  overall_rating: number | null;
  scorecard?: unknown;
  setter_self_reflection: string | null;
  fathom_link?: string | null;
  call_recording_link?: string | null;
  duration_minutes?: number | null;
}

export interface SetterCoachingViewProps {
  setterProfile: SetterCoachingProfile | null | undefined;
  activePIP: CoachingPip | null | undefined;
  pipLoading: boolean;
  coachingSessions: CoachingSession[] | undefined;
  sessionsLoading: boolean;
  /** Resolves true when the reflection saved (so the editor closes). */
  onSubmitReflection: (sessionId: string, text: string) => Promise<boolean>;
  submittingReflection: boolean;
}

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures).
 */
export const SetterCoachingView = ({
  setterProfile,
  activePIP,
  pipLoading,
  coachingSessions,
  sessionsLoading,
  onSubmitReflection,
  submittingReflection,
}: SetterCoachingViewProps) => {
  const [selfReflection, setSelfReflection] = useState("");
  const [reflectingSessionId, setReflectingSessionId] = useState<string | null>(null);

  const submitReflection = async (sessionId: string, text: string) => {
    const ok = await onSubmitReflection(sessionId, text);
    if (ok) {
      setReflectingSessionId(null);
      setSelfReflection("");
    }
  };

  const isOnPIP = setterProfile?.status === 'pip' || activePIP?.status === 'active';

  const scheduledSessions = (coachingSessions || []).filter(s =>
    s.status === 'scheduled' && (isFuture(new Date(s.session_date)) || isToday(new Date(s.session_date)))
  );
  const completedSessions = (coachingSessions || []).filter(s => s.status === 'completed');


  const sessionTypeLabel = (type: string, customLabel?: string | null) => {
    if (type === 'custom' && customLabel) return customLabel;
    return type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <DashboardLayout role="setter">
      <PageContainer>
      <PageHeader title="My Training" subtitle="Your coaching sessions and what came out of them" />

      {/* PIP Alert */}
      {isOnPIP && activePIP && (
        <div className="mb-6 rounded-[10px] bg-[var(--bad-bg)] px-4 py-3 [box-shadow:inset_3px_0_0_var(--bad)]">
          <p className="font-head text-[15px] font-medium text-[var(--bad)]">Performance Improvement Plan active</p>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Start date</dt><dd>{format(new Date(activePIP.start_date), 'd MMM yyyy')}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">End date</dt><dd>{activePIP.end_date ? format(new Date(activePIP.end_date), 'd MMM yyyy') : 'TBD'}</dd></div>
            {activePIP.reason && <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Focus area</dt><dd>{activePIP.reason}</dd></div>}
          </dl>
          {activePIP.target_metrics && (
            <div className="mt-2 flex flex-wrap gap-[5px]">
              {Object.entries(activePIP.target_metrics as Record<string, number>).map(([key, value]) => (
                <Pill key={key} variant="bad">{key}: {value}</Pill>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="upcoming" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({scheduledSessions.length})</TabsTrigger>
          <TabsTrigger value="history">History ({completedSessions.length})</TabsTrigger>
        </TabsList>

        {/* Upcoming Sessions */}
        <TabsContent value="upcoming">
          {sessionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : scheduledSessions.length > 0 ? (
            <RowList columns="180px 1fr auto">
              {scheduledSessions.map(session => (
                <Row key={session.id} focus={isToday(new Date(session.session_date))}>
                  <RowNum className="text-[var(--dim)]">{format(new Date(session.session_date), 'EEE d MMM')}{session.session_time ? ` · ${session.session_time}` : ''}</RowNum>
                  <RowName primary={sessionTypeLabel(session.session_type, session.custom_session_label)} secondary={session.agenda || undefined} />
                  <div className="flex items-center gap-[5px]">
                    {session.duration_minutes ? <Pill>{session.duration_minutes} min</Pill> : null}
                    {isToday(new Date(session.session_date)) ? <Pill variant="info">Today</Pill> : <Pill>Upcoming</Pill>}
                  </div>
                </Row>
              ))}
            </RowList>
          ) : (
            <div className="border-t border-[var(--line)] py-10 text-center">
              <p className="text-[12px] text-[var(--dim)]">No upcoming coaching sessions scheduled</p>
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">Your manager will schedule sessions for you</p>
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          {sessionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : completedSessions.length > 0 ? (
            <div>
              {completedSessions.map(session => (
                <Collapsible key={session.id}>
                  <div className="border-b border-[var(--line)]">
                    <CollapsibleTrigger className="group w-full text-left">
                      <div className="px-[14px] py-[10px] hover:[&_.row-primary]:text-[var(--accent)]">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="row-primary text-[13px] font-semibold">{sessionTypeLabel(session.session_type, session.custom_session_label)}</p>
                              {session.overall_rating && (
                                <div className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <Star key={i} className={`h-3 w-3 ${i < session.overall_rating! ? 'text-[var(--warn)] fill-[var(--warn)]' : 'text-[var(--dim2)]/40'}`} />
                                  ))}
                                </div>
                              )}
                            </div>
                            <p className="font-mono text-[11px] text-[var(--dim)]">
                              {format(new Date(session.session_date), 'EEE d MMM yyyy')}
                            </p>
                            {session.improvements && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                Focus: {session.improvements}
                              </p>
                            )}
                          </div>
                          <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-[var(--dim)] transition-transform group-data-[state=open]:rotate-180" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 px-[14px] pb-4">
                        {(session.fathom_link || session.call_recording_link) && (
                          <div className="pt-3 flex flex-wrap gap-2">
                            {session.fathom_link && (
                              <ButtonV2 size="sm" onClick={() => window.open(session.fathom_link!, '_blank', 'noopener,noreferrer')}>Fathom recording</ButtonV2>
                            )}
                            {session.call_recording_link && (
                              <ButtonV2 size="sm" onClick={() => window.open(session.call_recording_link!, '_blank', 'noopener,noreferrer')}>Call recording</ButtonV2>
                            )}
                          </div>
                        )}
                        {session.observations && (
                          <div className="pt-3">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Observations</p>
                            <p className="text-sm mt-1">{session.observations}</p>
                          </div>
                        )}
                        {session.improvements && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Improvements focus</p>
                            <p className="text-sm mt-1">{session.improvements}</p>
                          </div>
                        )}
                        {session.action_items && session.action_items.length > 0 && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Action items</p>
                            <ul className="mt-1 space-y-1">
                              {session.action_items.map((item: string, idx: number) => (
                                <li key={idx} className="text-sm flex items-start gap-2">
                                  <span className="text-muted-foreground">•</span> {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Self-reflection */}
                        {session.setter_self_reflection ? (
                          <div className="rounded-[8px] bg-[var(--surf2)] p-3">
                            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">Your self-reflection</p>
                            <p className="text-sm">{session.setter_self_reflection}</p>
                          </div>
                        ) : (
                          <div>
                            {reflectingSessionId === session.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  placeholder="How do you think the session went? What are your takeaways?"
                                  value={selfReflection}
                                  onChange={(e) => setSelfReflection(e.target.value)}
                                  rows={3}
                                />
                                <div className="flex gap-2">
                                  <ButtonV2 size="sm" onClick={() => { setReflectingSessionId(null); setSelfReflection(""); }}>Cancel</ButtonV2>
                                  <ButtonV2 size="sm" variant="primary" onClick={() => submitReflection(session.id, selfReflection)} disabled={!selfReflection.trim() || submittingReflection}>Submit</ButtonV2>
                                </div>
                              </div>
                            ) : (
                              <ButtonV2 size="sm" onClick={() => { setReflectingSessionId(session.id); setSelfReflection(""); }}>Add self-reflection</ButtonV2>
                            )}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ) : (
            <div className="border-t border-[var(--line)] py-10 text-center">
              <p className="text-[12px] text-[var(--dim)]">No completed coaching sessions yet</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

const SetterCoaching = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: setterProfile } = useQuery({
    queryKey: ['setter-profile-coaching', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('setters_profiles')
        .select('id, status, current_coaching_focus, full_name, title, per_meeting_bonus, department')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id
  });

  const { data: activePIP, isLoading: pipLoading } = useQuery({
    queryKey: ['setter-active-pip', setterProfile?.id],
    queryFn: async () => {
      if (!setterProfile?.id) return null;
      const { data } = await supabase
        .from('pip_records')
        .select('id, start_date, end_date, reason, target_metrics, status')
        .eq('setter_profile_id', setterProfile.id)
        .eq('status', 'active')
        .maybeSingle();
      return data;
    },
    enabled: !!setterProfile?.id
  });

  const { data: coachingSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['setter-coaching-sessions', setterProfile?.id],
    queryFn: async () => {
      if (!setterProfile?.id) return [];
      const { data } = await supabase
        .from('coaching_sessions')
        .select('id, session_date, session_time, session_type, custom_session_label, status, action_items, improvements, observations, agenda, overall_rating, scorecard, setter_self_reflection, fathom_link, call_recording_link, duration_minutes')
        .eq('setter_profile_id', setterProfile.id)
        .order('session_date', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!setterProfile?.id
  });


  const submitReflectionMutation = useMutation({
    mutationFn: async ({ sessionId, text }: { sessionId: string; text: string }) => {
      const { error } = await supabase
        .from('coaching_sessions')
        .update({ setter_self_reflection: text })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Self-reflection submitted');
      queryClient.invalidateQueries({ queryKey: ['setter-coaching-sessions'] });
    },
  });

  return (
    <SetterCoachingView
      setterProfile={setterProfile}
      activePIP={activePIP}
      pipLoading={pipLoading}
      coachingSessions={coachingSessions}
      sessionsLoading={sessionsLoading}
      submittingReflection={submitReflectionMutation.isPending}
      onSubmitReflection={async (sessionId, text) => {
        try {
          await submitReflectionMutation.mutateAsync({ sessionId, text });
          return true;
        } catch {
          return false;
        }
      }}
    />
  );
};

export default SetterCoaching;
