import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Target, Gift, PartyPopper, Plus, Pencil, Trash2 } from "lucide-react";
import { format, endOfWeek } from "date-fns";
import { capitalizeSetterName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Demo surface only (3 Sep): a goal plus its per-setter contributions, so
 *  the acting-as SDR overview renders the real card on fixtures. */
export interface TeamGoalDemoEntry {
  goal: any;
  contributions: Array<{ setter_id: string; name: string; meetings: number }>;
}

interface TeamGoalCardProps {
  canManage?: boolean;
  className?: string;
  compact?: boolean;
  department?: string;
  /** When set, no queries run: these goals render instead of the DB's. */
  demoGoals?: TeamGoalDemoEntry[];
}

const REWARD_OPTIONS = [
  { value: "early_finish", label: "Early Finish" },
  { value: "day_off", label: "Day Off" },
  { value: "cash_bonus", label: "Cash Bonus" },
  { value: "team_lunch", label: "Team Lunch" },
  { value: "custom", label: "Custom Reward" },
];

const DEPARTMENT_OPTIONS = [
  { value: "both", label: "Both Departments" },
  { value: "fulfilment", label: "Fulfilment Only" },
  { value: "acquisition", label: "Acquisition Only" },
];

// Confetti particle component
const ConfettiParticle = ({ index }: { index: number }) => {
  const style = useMemo(() => {
    const colors = ['#10b981', '#f59e0b', '#9e9e9e', '#9e9e9e', '#06b6d4', '#f97316'];
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = 2 + Math.random() * 3;
    const size = 4 + Math.random() * 6;
    return {
      position: 'absolute' as const,
      left: `${left}%`,
      top: '-10px',
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: colors[index % colors.length],
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      animation: `confetti-fall ${duration}s ease-in ${delay}s infinite`,
      opacity: 0,
    };
  }, [index]);
  return <div style={style} />;
};

export const TeamGoalCard = ({ canManage = false, className, compact = false, department, demoGoals }: TeamGoalCardProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    target_meetings: 18,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    reward: "early_finish",
    custom_reward: "",
    department: "both",
    goal_metric: "meetings_booked" as "meetings_booked" | "sat_meetings",
  });

  // Fetch ALL active goals, filtered by department
  const { data: liveGoals } = useQuery({
    queryKey: ['active-team-goals', department],
    enabled: !demoGoals,
    queryFn: async () => {
      let query = (supabase as any)
        .from('team_goals')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (department) {
        query = query.or(`department.eq.${department},department.is.null,department.eq.both`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 15000,
  });

  const handleCreateGoal = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("You must be logged in"); return; }

    const dept = formData.department === 'both' ? null : formData.department;
    const metric = dept === 'acquisition' ? 'meetings_booked' : formData.goal_metric;
    const { error } = await (supabase as any).from('team_goals').insert({
      target_meetings: formData.target_meetings,
      start_date: formData.start_date,
      end_date: formData.end_date,
      reward: formData.reward === 'custom' ? formData.custom_reward : REWARD_OPTIONS.find(r => r.value === formData.reward)?.label || formData.reward,
      department: dept,
      goal_metric: metric,
      source: 'overview',
      created_by: user.id,
    });

    if (error) { toast.error(error.message || "Failed to create team goal"); return; }
    toast.success("Team goal created");
    queryClient.invalidateQueries({ queryKey: ['active-team-goals'] });
    setShowCreateModal(false);
    // Reset form
    setFormData({
      target_meetings: 18,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      reward: "early_finish",
      custom_reward: "",
      department: "both",
      goal_metric: "meetings_booked",
    });
  };

  const activeGoals = demoGoals ? demoGoals.map((d) => d.goal) : liveGoals;
  const demoContributionsFor = (goalId: string) =>
    demoGoals?.find((d) => d.goal.id === goalId)?.contributions;
  const hasGoals = activeGoals && activeGoals.length > 0;

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
        }
        @keyframes goal-glow {
          0%, 100% { box-shadow: 0 0 8px hsl(142 71% 45% / 0.2); }
          50% { box-shadow: 0 0 20px hsl(142 71% 45% / 0.4); }
        }
        @keyframes trophy-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>

      <div className={cn("space-y-4", className)}>
        {/* Render each active goal */}
        {activeGoals?.map(goal => (
          <SingleGoalCard
            key={goal.id}
            goal={goal}
            canManage={canManage}
            compact={compact}
            department={department}
            demoContributions={demoContributionsFor(goal.id)}
          />
        ))}

        {/* No goals - show empty state */}
        {!hasGoals && !canManage && (
          <Card className="border border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Team Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <Target className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">No active team goal</p>
                  <p className="text-xs text-muted-foreground mt-1">Your manager will set the next goal</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create new goal button for managers */}
        {canManage && (
          <Card
            className="border border-dashed border-border/50 bg-card/30 cursor-pointer hover:border-primary/30 transition-all"
            onClick={() => setShowCreateModal(true)}
          >
            <CardContent className="py-6">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium mt-2">{hasGoals ? 'Add Another Goal' : 'Set Team Goal'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a meeting target</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {canManage && (
        <GoalFormModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleCreateGoal}
          title="Set Team Goal"
          submitLabel="Create Team Goal"
        />
      )}
    </>
  );
};

// Single goal card component
function SingleGoalCard({ goal, canManage, compact, department, demoContributions }: { goal: any; canManage: boolean; compact: boolean; department?: string; demoContributions?: Array<{ setter_id: string; name: string; meetings: number }> }) {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCelebration, setCelebration] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    target_meetings: goal.target_meetings,
    start_date: goal.start_date,
    end_date: goal.end_date,
    reward: REWARD_OPTIONS.find(r => r.label === goal.reward)?.value || 'custom',
    custom_reward: REWARD_OPTIONS.find(r => r.label === goal.reward) ? '' : goal.reward,
    department: goal.department || 'both',
    goal_metric: (goal.goal_metric || 'meetings_booked') as 'meetings_booked' | 'sat_meetings',
  });

  const isSatMetric = goal.goal_metric === 'sat_meetings';

  const { data: liveContributions } = useQuery({
    queryKey: ['team-goal-contributions', goal.id, goal.goal_metric],
    enabled: !demoContributions,
    queryFn: async () => {
      const { data: setters } = await (supabase as any)
        .from('setters_profiles_safe')
        .select('id, user_id, email, full_name, department')
        .eq('active', true);

      if (!setters) return [];

      // AE telemetry rows never contribute to team goals — 'both' means both
      // setter departments (fulfilment + acquisition), not every profile row.
      const eligibleSetters = setters.filter(s => s.department !== 'sales');
      const goalDept = goal.department;
      const filteredSetters = goalDept && goalDept !== 'both'
        ? eligibleSetters.filter(s => s.department === goalDept)
        : eligibleSetters;

      if (isSatMetric) {
        // SAT goal: count meetings with attendance_status='sat' (synced from Appointment Scoring sheet)
        const { data: satMeetings } = await supabase
          .from('meetings')
          .select('setter_id, logged_by_setter_id, meeting_date, is_rebook, attendance_status')
          .eq('attendance_status', 'sat')
          .eq('is_rebook', false)
          .gte('meeting_date', goal.start_date)
          .lte('meeting_date', goal.end_date);

        return filteredSetters.map(setter => {
          const setterSat = (satMeetings || []).filter(m =>
            m.setter_id === setter.id || m.setter_id === setter.user_id ||
            m.logged_by_setter_id === setter.id || m.logged_by_setter_id === setter.user_id
          );
          return {
            setter_id: setter.id,
            name: setter.full_name || capitalizeSetterName(setter.email || ''),
            meetings: setterSat.length,
          };
        }).sort((a, b) => b.meetings - a.meetings);
      }

      const goalStartTimestamp = `${goal.start_date}T00:00:00.000Z`;
      const goalEndDate = new Date(`${goal.end_date}T00:00:00.000Z`);
      goalEndDate.setUTCDate(goalEndDate.getUTCDate() + 1);
      const goalEndExclusive = goalEndDate.toISOString();

      const { data: appMeetings } = await supabase
        .from('meetings')
        .select('setter_id, logged_by_setter_id, meeting_date, created_at, is_rebook')
        .gte('created_at', goalStartTimestamp)
        .lt('created_at', goalEndExclusive);

      return filteredSetters.map(setter => {
        const setterMeetings = (appMeetings || []).filter(m =>
          m.setter_id === setter.id || m.setter_id === setter.user_id ||
          m.logged_by_setter_id === setter.id || m.logged_by_setter_id === setter.user_id
        );
        const freshAppCount = setterMeetings.filter(m => !m.is_rebook).length;
        return {
          setter_id: setter.id,
          name: setter.full_name || capitalizeSetterName(setter.email || ''),
          meetings: freshAppCount,
        };
      }).sort((a, b) => b.meetings - a.meetings);
    },
    refetchInterval: 15000,
  });

  const contributions = demoContributions ?? liveContributions;
  const totalMeetings = contributions?.reduce((sum, c) => sum + c.meetings, 0) || 0;
  const progressPct = Math.min(100, (totalMeetings / goal.target_meetings) * 100);
  const isGoalReached = totalMeetings >= goal.target_meetings;

  useEffect(() => {
    if (isGoalReached) setCelebration(true);
  }, [isGoalReached]);

  const handleUpdateGoal = async () => {
    const dept = formData.department === 'both' ? null : formData.department;
    const metric = dept === 'acquisition' ? 'meetings_booked' : formData.goal_metric;
    const { error } = await (supabase as any).from('team_goals').update({
      target_meetings: formData.target_meetings,
      start_date: formData.start_date,
      end_date: formData.end_date,
      reward: formData.reward === 'custom' ? formData.custom_reward : REWARD_OPTIONS.find(r => r.value === formData.reward)?.label || formData.reward,
      department: dept,
      goal_metric: metric,
    }).eq('id', goal.id);

    if (error) { toast.error(error.message); return; }
    toast.success("Team goal updated");
    queryClient.invalidateQueries({ queryKey: ['active-team-goals'] });
    setIsEditing(false);
    setShowDetailModal(false);
  };

  const handleDeleteGoal = async () => {
    const { error } = await (supabase as any).from('team_goals').update({ status: 'cancelled' }).eq('id', goal.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Team goal deleted");
    queryClient.invalidateQueries({ queryKey: ['active-team-goals'] });
    setShowDetailModal(false);
  };

  const openDetailModal = () => {
    setFormData({
      target_meetings: goal.target_meetings,
      start_date: goal.start_date,
      end_date: goal.end_date,
      reward: REWARD_OPTIONS.find(r => r.label === goal.reward)?.value || 'custom',
      custom_reward: REWARD_OPTIONS.find(r => r.label === goal.reward) ? '' : goal.reward,
      department: goal.department || 'both',
      goal_metric: (goal.goal_metric || 'meetings_booked') as 'meetings_booked' | 'sat_meetings',
    });
    setIsEditing(false);
    setShowDetailModal(true);
  };

  const rewardLabel = goal.reward || '';
  const deptLabel = goal.department
    ? DEPARTMENT_OPTIONS.find(d => d.value === goal.department)?.label || goal.department
    : 'Both Departments';

  return (
    <>
      <Card
        className={cn(
          "border border-border/50 bg-card/50 relative overflow-hidden transition-all cursor-pointer hover:border-primary/30",
          isGoalReached && "border-green-500/40",
        )}
        style={isGoalReached ? { animation: 'goal-glow 2s ease-in-out infinite' } : undefined}
        onClick={openDetailModal}
      >
        {isGoalReached && showCelebration && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {Array.from({ length: 24 }).map((_, i) => (
              <ConfettiParticle key={i} index={i} />
            ))}
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {isGoalReached ? <PartyPopper className="h-4 w-4 text-green-500" /> : <Target className="h-4 w-4" />}
              Team Goal
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {isSatMetric ? 'SAT' : 'Booked'}
              </Badge>
              {goal.source === 'morning_meeting' && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary">
                  Morning Meeting
                </Badge>
              )}
            </CardTitle>
            <Badge variant="outline" className="capitalize text-xs flex items-center gap-1">
              <Gift className="h-3 w-3" />
              {rewardLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center justify-center relative">
            {isGoalReached && (
              <div className="absolute -top-5" style={{ animation: 'trophy-bounce 1s ease-in-out infinite' }}>🏆</div>
            )}
            <div className="text-center">
              <div className="text-4xl font-bold">
                <span className={isGoalReached ? "text-green-500" : "text-primary"}>{totalMeetings}</span>
                <span className="text-muted-foreground text-xl font-normal"> / {goal.target_meetings}</span>
              </div>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {isGoalReached ? '🎉 Goal Reached!' : `by ${format(new Date(goal.end_date), 'MMM d')}`}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Progress value={progressPct} className={cn("h-2", isGoalReached && "[&>div]:bg-green-500")} />
          </div>

          <div className="flex items-center justify-center gap-4 pt-1 border-t border-border/30">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Contributors</div>
              <div className="text-sm font-semibold text-primary">{contributions?.filter(c => c.meetings > 0).length || 0}</div>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Remaining</div>
              <div className="text-sm font-semibold">{isGoalReached ? '✓' : Math.max(0, goal.target_meetings - totalMeetings)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail / Edit Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />Team Goal Details
            </DialogTitle>
            <DialogDescription>
              {isEditing ? "Edit team goal settings" : `${deptLabel} • ${format(new Date(goal.start_date), 'MMM d')} – ${format(new Date(goal.end_date), 'MMM d')}`}
            </DialogDescription>
          </DialogHeader>

          {isEditing ? (
            <div className="space-y-4">
              <div><Label>Target Meetings</Label><Input type="number" min={1} value={formData.target_meetings} onChange={e => setFormData(p => ({ ...p, target_meetings: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Department</Label>
                <Select value={formData.department} onValueChange={v => setFormData(p => ({ ...p, department: v, goal_metric: v === 'acquisition' ? 'meetings_booked' : p.goal_metric }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPARTMENT_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {formData.department !== 'acquisition' && (
                <div><Label>Goal Metric</Label>
                  <Select value={formData.goal_metric} onValueChange={(v: any) => setFormData(p => ({ ...p, goal_metric: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meetings_booked">Meetings Booked</SelectItem>
                      <SelectItem value="sat_meetings">SAT Meetings (attended)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} /></div>
                <div><Label>End Date</Label><Input type="date" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} /></div>
              </div>
              <div><Label>Reward</Label>
                <Select value={formData.reward} onValueChange={v => setFormData(p => ({ ...p, reward: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REWARD_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {formData.reward === 'custom' && (
                <div><Label>Custom Reward</Label><Input value={formData.custom_reward} onChange={e => setFormData(p => ({ ...p, custom_reward: e.target.value }))} placeholder="e.g., Team dinner at..." /></div>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleUpdateGoal}>Save Changes</Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold">
                  <span className={isGoalReached ? "text-green-500" : "text-primary"}>{totalMeetings}</span>
                  <span className="text-muted-foreground text-lg"> / {goal.target_meetings}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Reward: {rewardLabel}</p>
              </div>
              <Progress value={progressPct} className={cn("h-3", isGoalReached && "[&>div]:bg-green-500")} />

              {contributions && contributions.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground">Setter Contributions</p>
                  {contributions.map(c => (
                    <div key={c.setter_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.name}</span>
                      <Badge variant={c.meetings > 0 ? "default" : "secondary"} className="text-xs ml-2">{c.meetings}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {isGoalReached && (
                <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                  <p className="text-sm font-semibold text-green-600">🎉 Goal Reached!</p>
                </div>
              )}

              {canManage && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" />Edit
                  </Button>
                  <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleDeleteGoal}>
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GoalFormModal({ open, onOpenChange, formData, setFormData, onSubmit, title, submitLabel }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Target Meetings</Label><Input type="number" min={1} value={formData.target_meetings} onChange={e => setFormData((p: any) => ({ ...p, target_meetings: parseInt(e.target.value) || 0 }))} /></div>
          <div><Label>Department</Label>
            <Select value={formData.department} onValueChange={v => setFormData((p: any) => ({ ...p, department: v, goal_metric: v === 'acquisition' ? 'meetings_booked' : p.goal_metric }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENT_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {formData.department !== 'acquisition' && (
            <div><Label>Goal Metric</Label>
              <Select value={formData.goal_metric} onValueChange={(v: any) => setFormData((p: any) => ({ ...p, goal_metric: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meetings_booked">Meetings Booked</SelectItem>
                  <SelectItem value="sat_meetings">SAT Meetings (attended)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">SAT meetings progress when the Appointment Scoring sheet marks them as attended.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={e => setFormData((p: any) => ({ ...p, start_date: e.target.value }))} /></div>
            <div><Label>End Date</Label><Input type="date" value={formData.end_date} onChange={e => setFormData((p: any) => ({ ...p, end_date: e.target.value }))} /></div>
          </div>
          <div><Label>Reward</Label>
            <Select value={formData.reward} onValueChange={v => setFormData((p: any) => ({ ...p, reward: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REWARD_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {formData.reward === 'custom' && (
            <div><Label>Custom Reward</Label><Input value={formData.custom_reward} onChange={e => setFormData((p: any) => ({ ...p, custom_reward: e.target.value }))} placeholder="e.g., Team dinner at..." /></div>
          )}
          <Button className="w-full" onClick={onSubmit}>{submitLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
