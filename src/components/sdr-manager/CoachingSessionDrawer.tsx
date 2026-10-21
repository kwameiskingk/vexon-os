import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarIcon, Plus, X, Trash2, Pencil, Save, Play, Clock, CheckCircle2, ChevronDown, Star, History, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CoachingScorecard, { ScorecardData, defaultScorecard } from "./CoachingScorecard";
import CoachingActionItems from "./CoachingActionItems";

interface CoachingSession {
  id: string;
  session_date: string;
  session_time?: string | null;
  session_type: string;
  custom_session_label?: string | null;
  status?: string;
  observations?: string | null;
  improvements?: string | null;
  roleplay_notes?: string | null;
  action_items?: string[] | null;
  call_recording_link?: string | null;
  notes?: string | null;
  agenda?: string | null;
  overall_rating?: number | null;
  scorecard?: any;
  fathom_link?: string | null;
  priority_1?: string | null;
  priority_2?: string | null;
  setter_self_reflection?: string | null;
  setters_profiles?: { full_name: string } | null;
  setter_profile_id?: string;
  manager_user_id?: string;
}

interface CoachingSessionDrawerProps {
  open: boolean;
  onClose: () => void;
  session: CoachingSession | null;
  startInSessionMode?: boolean;
}

const sessionTypeLabels: Record<string, string> = {
  'onboarding': 'Onboarding',
  'weekly_1to1': 'Weekly 1:1',
  'pip_review': 'PIP Review',
  'call_review': 'Call Review',
  'custom': 'Custom',
};

const CoachingSessionDrawer = ({ open, onClose, session, startInSessionMode = false }: CoachingSessionDrawerProps) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit' | 'session'>('view');

  // Form state
  const [sessionDate, setSessionDate] = useState<Date>(new Date());
  const [observations, setObservations] = useState("");
  const [improvements, setImprovements] = useState("");
  const [roleplayNotes, setRoleplayNotes] = useState("");
  const [actionItems, setActionItems] = useState<{ description: string; due_date?: string | null; status: string }[]>([]);
  const [callRecordingLink, setCallRecordingLink] = useState("");
  const [fathomLink, setFathomLink] = useState("");
  const [priority1, setPriority1] = useState("");
  const [priority2, setPriority2] = useState("");
  const [notes, setNotes] = useState("");
  const [overallRating, setOverallRating] = useState(0);
  const [scorecard, setScorecard] = useState<ScorecardData>(defaultScorecard);
  const [contextOpen, setContextOpen] = useState(true);

  // Fetch last session for context
  const { data: lastSession } = useQuery({
    queryKey: ['last-coaching-session', session?.setter_profile_id, session?.id],
    queryFn: async () => {
      if (!session?.setter_profile_id) return null;
      const { data } = await supabase
        .from('coaching_sessions')
        .select('id, session_date, session_type, improvements, observations, overall_rating, custom_session_label')
        .eq('setter_profile_id', session.setter_profile_id)
        .eq('status', 'completed')
        .neq('id', session.id)
        .order('session_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!session?.setter_profile_id && open,
  });

  // Fetch open action items for this setter
  const { data: openActionItems } = useQuery({
    queryKey: ['open-action-items', session?.setter_profile_id],
    queryFn: async () => {
      if (!session?.setter_profile_id) return [];
      const { data } = await supabase
        .from('coaching_action_items')
        .select('*')
        .eq('setter_profile_id', session.setter_profile_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!session?.setter_profile_id && open,
  });

  useEffect(() => {
    if (startInSessionMode && open) {
      setMode('session');
      initSessionMode();
    } else if (open) {
      setMode('view');
    }
  }, [open, startInSessionMode]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMode('view');
      onClose();
    }
  };

  const initSessionMode = () => {
    setObservations("");
    setImprovements("");
    setRoleplayNotes("");
    setActionItems([]);
    setCallRecordingLink("");
    setFathomLink("");
    setPriority1("");
    setPriority2("");
    setNotes("");
    setOverallRating(0);
    setScorecard(defaultScorecard);
    setMode('session');
  };

  const startEditing = () => {
    if (session) {
      setSessionDate(new Date(session.session_date));
      setObservations(session.observations || "");
      setImprovements(session.improvements || "");
      setRoleplayNotes(session.roleplay_notes || "");
      setCallRecordingLink(session.call_recording_link || "");
      setFathomLink(session.fathom_link || "");
      setPriority1(session.priority_1 || "");
      setPriority2(session.priority_2 || "");
      setNotes(session.notes || "");
      setOverallRating(session.overall_rating || 0);
      setScorecard(session.scorecard || defaultScorecard);
      // Convert old string action items to new format for editing
      setActionItems(
        (session.action_items || []).map((item: string) => ({ description: item, due_date: null, status: 'open' }))
      );
    }
    setMode('edit');
  };

  const saveActionItemsToDb = async (sessionId: string, setterProfileId: string, managerId: string) => {
    const validItems = actionItems.filter(i => i.description.trim());
    if (validItems.length === 0) return;

    const { error } = await supabase
      .from('coaching_action_items')
      .insert(validItems.map(item => ({
        coaching_session_id: sessionId,
        setter_profile_id: setterProfileId,
        manager_user_id: managerId,
        description: item.description,
        due_date: item.due_date || null,
        status: 'open',
      })));
    if (error) console.error('Action items save error:', error);
  };

  // For a call review the TWO PRIORITIES are the improvements (Marcus's 2 Sep
  // spec) — mirrored into the legacy improvements column so the coaching-focus
  // update, the context panel and every older surface keep working, even
  // before migration 20260902150000 adds the structured columns.
  const isCallReview = session?.session_type === 'call_review';
  const effectiveImprovements = isCallReview
    ? [priority1, priority2].filter((p) => p.trim()).map((p, i) => `${i + 1}. ${p.trim()}`).join('  ') || null
    : improvements || null;

  // priority_1/priority_2/fathom_link land with migration 20260902150000 —
  // guarded separate update, so completing a session never fails pre-apply.
  const saveCallReviewExtras = async (sessionId: string) => {
    if (!isCallReview) return;
    const { error } = await supabase
      .from('coaching_sessions')
      .update({
        fathom_link: fathomLink || null,
        priority_1: priority1 || null,
        priority_2: priority2 || null,
      } as never)
      .eq('id', sessionId);
    if (error) {
      toast.warning('Saved — but the Fathom/priority fields need the pending database migration.');
    }
  };

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const { error } = await supabase
        .from('coaching_sessions')
        .update({
          status: 'completed',
          observations: observations || null,
          improvements: effectiveImprovements,
          roleplay_notes: roleplayNotes || null,
          action_items: actionItems.filter(i => i.description.trim()).map(i => i.description),
          call_recording_link: callRecordingLink || null,
          notes: notes || null,
          overall_rating: overallRating || null,
          scorecard: session.session_type === 'call_review' ? (scorecard as any) : null,
        })
        .eq('id', session.id);

      if (error) throw error;

      await saveCallReviewExtras(session.id);

      // Save action items to the new table
      if (session.setter_profile_id) {
        await saveActionItemsToDb(session.id, session.setter_profile_id, session.manager_user_id || '');
      }

      // Update coaching focus
      if (effectiveImprovements && session.setter_profile_id) {
        await supabase
          .from('setters_profiles')
          .update({ current_coaching_focus: effectiveImprovements })
          .eq('id', session.setter_profile_id);
      }
    },
    onSuccess: () => {
      toast.success('Coaching session completed');
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-coaching-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['coaching-action-items'] });
      setMode('view');
      onClose();
    },
    onError: (error: any) => {
      toast.error(`Failed to complete session: ${error?.message || 'Unknown error'}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const { error } = await supabase
        .from('coaching_sessions')
        .update({
          session_date: format(sessionDate, 'yyyy-MM-dd'),
          observations: observations || null,
          improvements: effectiveImprovements,
          roleplay_notes: roleplayNotes || null,
          action_items: actionItems.filter(i => i.description.trim()).map(i => i.description),
          call_recording_link: callRecordingLink || null,
          notes: notes || null,
          overall_rating: overallRating || null,
          scorecard: session.session_type === 'call_review' ? (scorecard as any) : null,
        })
        .eq('id', session.id);

      if (error) throw error;
      await saveCallReviewExtras(session.id);
    },
    onSuccess: () => {
      toast.success('Session updated');
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-coaching-sessions'] });
      setMode('view');
    },
    onError: () => {
      toast.error('Failed to update session');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const { error } = await supabase
        .from('coaching_sessions')
        .delete()
        .eq('id', session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Session deleted');
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-coaching-sessions'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to delete session');
    }
  });

  if (!session) return null;

  const setterName = (session.setters_profiles as any)?.full_name || 'Unknown';
  const isScheduled = session.status === 'scheduled';
  const isCompleted = session.status === 'completed';
  const sessionLabel = session.session_type === 'custom' && session.custom_session_label
    ? session.custom_session_label
    : sessionTypeLabels[session.session_type] || session.session_type;

  const renderRatingStars = (value: number, onChange?: (v: number) => void) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i + 1)}
          disabled={!onChange}
          className={cn("transition-colors", onChange && "cursor-pointer hover:scale-110")}
        >
          <Star
            className={`h-5 w-5 ${i < value ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
          />
        </button>
      ))}
    </div>
  );

  const renderContextPanel = () => {
    if (!lastSession && (!openActionItems || openActionItems.length === 0)) return null;

    return (
      <Collapsible open={contextOpen} onOpenChange={setContextOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-primary" />
            Session Context
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", contextOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          {lastSession && (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Last Session</p>
              <p className="text-sm">
                {sessionTypeLabels[lastSession.session_type] || lastSession.custom_session_label || lastSession.session_type}
                {' — '}{format(new Date(lastSession.session_date), 'MMM d, yyyy')}
              </p>
              {lastSession.improvements && (
                <p className="text-xs text-muted-foreground">Focus: {lastSession.improvements}</p>
              )}
              {lastSession.overall_rating && (
                <div className="flex items-center gap-1 mt-1">
                  {renderRatingStars(lastSession.overall_rating)}
                </div>
              )}
            </div>
          )}
          {openActionItems && openActionItems.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-yellow-400" />
                <p className="text-xs font-medium text-yellow-400">
                  {openActionItems.length} Open Action Item{openActionItems.length !== 1 ? 's' : ''}
                </p>
              </div>
              {openActionItems.slice(0, 3).map((item: any) => (
                <p key={item.id} className="text-xs text-muted-foreground pl-6">• {item.description}</p>
              ))}
              {openActionItems.length > 3 && (
                <p className="text-xs text-muted-foreground pl-6">+{openActionItems.length - 3} more</p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderSessionForm = () => (
    <>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-4">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Play className="h-4 w-4" />
          <span className="font-medium text-sm">Session In Progress</span>
        </div>
        <p className="text-xs text-muted-foreground">Fill in the details as you go through the session with {setterName}.</p>
      </div>

      {renderContextPanel()}

      {session.agenda && (
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground mb-1">📋 Agenda</p>
          <p className="text-sm">{session.agenda}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Observations</Label>
        <Textarea placeholder="What did you observe during this session?" value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} />
      </div>

      {session.session_type === 'call_review' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Priority 1 <span className="text-xs text-muted-foreground">(what they're working on)</span></Label>
            <Input placeholder="e.g. Return to the qualifier after every objection" value={priority1} onChange={(e) => setPriority1(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority 2</Label>
            <Input placeholder="e.g. Ask all four problem-discovery questions" value={priority2} onChange={(e) => setPriority2(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Top 1-2 Improvements</Label>
          <Textarea placeholder="What are the highest impact areas for improvement?" value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={2} />
        </div>
      )}

      {session.session_type === 'call_review' && (
        <CoachingScorecard scorecard={scorecard} onChange={setScorecard} />
      )}

      <div className="space-y-2">
        <Label>Roleplay Notes</Label>
        <Textarea placeholder="Notes from roleplay exercises (optional)" value={roleplayNotes} onChange={(e) => setRoleplayNotes(e.target.value)} rows={2} />
      </div>

      <CoachingActionItems
        items={actionItems}
        onChange={setActionItems}
        mode="edit"
      />

      {session.session_type === 'call_review' && (
        <div className="space-y-2">
          <Label>Fathom Link</Label>
          <Input placeholder="https://fathom.video/..." value={fathomLink} onChange={(e) => setFathomLink(e.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Call Recording Link</Label>
        <Input placeholder="https://..." value={callRecordingLink} onChange={(e) => setCallRecordingLink(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Additional Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Overall Rating</Label>
        {renderRatingStars(overallRating, setOverallRating)}
      </div>

      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={() => setMode('view')} className="flex-1">Cancel</Button>
        <Button onClick={() => completeSessionMutation.mutate()} disabled={completeSessionMutation.isPending} className="flex-1">
          <CheckCircle2 className="h-4 w-4 mr-2" /> Complete Session
        </Button>
      </div>
    </>
  );

  const renderEditForm = () => (
    <>
      <div className="space-y-2">
        <Label>Session Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !sessionDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {sessionDate ? format(sessionDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={sessionDate} onSelect={(date) => date && setSessionDate(date)} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Observations</Label>
        <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} />
      </div>
      {session.session_type === 'call_review' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Priority 1 <span className="text-xs text-muted-foreground">(what they're working on)</span></Label>
            <Input placeholder="e.g. Return to the qualifier after every objection" value={priority1} onChange={(e) => setPriority1(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority 2</Label>
            <Input placeholder="e.g. Ask all four problem-discovery questions" value={priority2} onChange={(e) => setPriority2(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Top 1-2 Improvements</Label>
          <Textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={2} />
        </div>
      )}

      {session.session_type === 'call_review' && (
        <CoachingScorecard scorecard={scorecard} onChange={setScorecard} />
      )}

      <div className="space-y-2">
        <Label>Roleplay Notes</Label>
        <Textarea value={roleplayNotes} onChange={(e) => setRoleplayNotes(e.target.value)} rows={2} />
      </div>

      <CoachingActionItems
        items={actionItems}
        onChange={setActionItems}
        mode="edit"
      />

      {session.session_type === 'call_review' && (
        <div className="space-y-2">
          <Label>Fathom Link</Label>
          <Input placeholder="https://fathom.video/..." value={fathomLink} onChange={(e) => setFathomLink(e.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Call Recording Link</Label>
        <Input placeholder="https://..." value={callRecordingLink} onChange={(e) => setCallRecordingLink(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Additional Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Overall Rating</Label>
        {renderRatingStars(overallRating, setOverallRating)}
      </div>

      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={() => setMode('view')} className="flex-1">Cancel</Button>
        <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="flex-1">
          <Save className="h-4 w-4 mr-2" /> Save Changes
        </Button>
      </div>
    </>
  );

  const renderViewMode = () => (
    <>
      <div className="flex items-center gap-2 mb-4">
        {isScheduled ? (
          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" /> Scheduled
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
          </Badge>
        )}
        {session.session_time && (
          <span className="text-sm text-muted-foreground">at {session.session_time}</span>
        )}
        {session.overall_rating && renderRatingStars(session.overall_rating)}
      </div>

      {session.agenda && (
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30 mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">📋 Agenda</p>
          <p className="text-sm">{session.agenda}</p>
        </div>
      )}

      {isScheduled && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">This session hasn't been completed yet.</p>
          <Button onClick={initSessionMode}>
            <Play className="h-4 w-4 mr-2" /> Start Session
          </Button>
        </div>
      )}

      {isCompleted && (
        <div className="space-y-4">
          {session.observations && (
            <div>
              <Label className="text-xs text-muted-foreground">Observations</Label>
              <p className="mt-1 text-sm">{session.observations}</p>
            </div>
          )}
          {(session.priority_1 || session.priority_2) ? (
            <div>
              <Label className="text-xs text-muted-foreground">Working On</Label>
              <ul className="mt-1 space-y-1">
                {session.priority_1 && <li className="text-sm">1. {session.priority_1}</li>}
                {session.priority_2 && <li className="text-sm">2. {session.priority_2}</li>}
              </ul>
            </div>
          ) : session.improvements ? (
            <div>
              <Label className="text-xs text-muted-foreground">Improvements Focus</Label>
              <p className="mt-1 text-sm">{session.improvements}</p>
            </div>
          ) : null}
          {session.fathom_link && (
            <div>
              <Label className="text-xs text-muted-foreground">Fathom</Label>
              <a href={session.fathom_link} target="_blank" rel="noopener noreferrer" className="mt-1 text-sm text-primary hover:underline block">
                Watch on Fathom
              </a>
            </div>
          )}

          {session.session_type === 'call_review' && session.scorecard && (
            <CoachingScorecard scorecard={session.scorecard} onChange={() => {}} readOnly />
          )}

          {session.roleplay_notes && (
            <div>
              <Label className="text-xs text-muted-foreground">Roleplay Notes</Label>
              <p className="mt-1 text-sm">{session.roleplay_notes}</p>
            </div>
          )}
          {session.action_items && session.action_items.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Action Items</Label>
              <ul className="mt-1 space-y-1">
                {session.action_items.map((item, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {session.call_recording_link && (
            <div>
              <Label className="text-xs text-muted-foreground">Call Recording</Label>
              <a href={session.call_recording_link} target="_blank" rel="noopener noreferrer" className="mt-1 text-sm text-primary hover:underline block">
                View Recording
              </a>
            </div>
          )}
          {session.notes && (
            <div>
              <Label className="text-xs text-muted-foreground">Additional Notes</Label>
              <p className="mt-1 text-sm">{session.notes}</p>
            </div>
          )}
          {session.setter_self_reflection && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Label className="text-xs text-blue-400">Setter Self-Reflection</Label>
              <p className="mt-1 text-sm">{session.setter_self_reflection}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t">
        {isCompleted && (
          <Button variant="outline" onClick={startEditing} className="flex-1">
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="flex-1">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete coaching session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this coaching session with {setterName}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {setterName}
            <Badge variant="secondary">{sessionLabel}</Badge>
          </SheetTitle>
          <SheetDescription>
            {format(new Date(session.session_date), 'MMMM d, yyyy')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {mode === 'session' ? renderSessionForm() : mode === 'edit' ? renderEditForm() : renderViewMode()}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CoachingSessionDrawer;
