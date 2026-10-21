import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Target, CheckCircle2, XCircle, Clock, Flame, Pencil, Save, Send } from "lucide-react";
import { toast } from "sonner";
import {
  type WeeklyGoal,
  getCurrentCampaignWeek,
  getConsecutiveStreak,
  getCompletedGoalHitRate,
  getGoalStatusColor,
} from "@/lib/campaignGoals";

interface GoalWithPublish extends WeeklyGoal {
  published_achieved: number;
}

interface CampaignWeeklyGoalsProps {
  campaignId: string;
  campaignStartDate: string | null;
  campaignStatus: string;
}

export function CampaignWeeklyGoals({ campaignId, campaignStartDate, campaignStatus }: CampaignWeeklyGoalsProps) {
  const queryClient = useQueryClient();
  const [editingTargets, setEditingTargets] = useState(false);
  const [editedTargets, setEditedTargets] = useState<Record<string, number>>({});

  const { data: goals, isLoading } = useQuery({
    queryKey: ["campaign-weekly-goals-admin", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_weekly_goals")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data || []) as GoalWithPublish[];
    },
  });

  const updateTargetsMutation = useMutation({
    mutationFn: async (targets: Record<string, number>) => {
      const updates = Object.entries(targets).map(([id, target]) =>
        supabase.from("campaign_weekly_goals").update({ target }).eq("id", id)
      );
      const results = await Promise.all(updates);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-weekly-goals-admin", campaignId] });
      toast.success("Weekly targets updated");
      setEditingTargets(false);
      setEditedTargets({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishWeekMutation = useMutation({
    mutationFn: async (goalId: string) => {
      // Find the goal to get current achieved value
      const goal = goals?.find(g => g.id === goalId);
      if (!goal) throw new Error("Goal not found");
      
      const { error } = await supabase
        .from("campaign_weekly_goals")
        .update({ published_achieved: goal.achieved })
        .eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-weekly-goals-admin", campaignId] });
      toast.success("Week's progress published to client");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishAllMutation = useMutation({
    mutationFn: async () => {
      if (!goals) return;
      const today = new Date();
      const pastOrCurrentGoals = goals.filter(g => {
        const weekEnd = new Date(g.week_end);
        return weekEnd < today || (campaignStartDate && g.week_number <= getCurrentCampaignWeek(campaignStartDate));
      });
      
      const updates = pastOrCurrentGoals.map(goal =>
        supabase.from("campaign_weekly_goals")
          .update({ published_achieved: goal.achieved })
          .eq("id", goal.id)
      );
      const results = await Promise.all(updates);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-weekly-goals-admin", campaignId] });
      toast.success("All weeks published to client");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Daniel's per-client visibility toggle (client_profiles.show_weekly_goals).
  // Renders only once the migration adds the column — select error hides it.
  const { data: visibility } = useQuery({
    queryKey: ["weekly-goals-visibility", campaignId],
    queryFn: async (): Promise<{ id: string; show: boolean } | null> => {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("client_id")
        .eq("id", campaignId)
        .maybeSingle();
      if (!campaign?.client_id) return null;
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, show_weekly_goals" as "id")
        .eq("id", campaign.client_id)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as unknown as { id: string; show_weekly_goals?: boolean };
      return { id: row.id, show: row.show_weekly_goals !== false };
    },
  });

  const toggleVisibility = useMutation({
    mutationFn: async (show: boolean) => {
      if (!visibility?.id) return;
      const { error } = await supabase
        .from("client_profiles")
        .update({ show_weekly_goals: show } as never)
        .eq("id", visibility.id);
      if (error) throw error;
    },
    onSuccess: (_d, show) => {
      queryClient.invalidateQueries({ queryKey: ["weekly-goals-visibility", campaignId] });
      toast.success(show ? "Weekly goals visible to the client" : "Weekly goals hidden from the client");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSaveTargets = () => {
    if (Object.keys(editedTargets).length === 0) {
      setEditingTargets(false);
      return;
    }
    updateTargetsMutation.mutate(editedTargets);
  };

  const startEditing = () => {
    if (!goals) return;
    const initial: Record<string, number> = {};
    goals.forEach(g => { initial[g.id] = g.target; });
    setEditedTargets(initial);
    setEditingTargets(true);
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!goals?.length) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No weekly goals generated. Set campaign start and end dates to auto-generate goals.
        </CardContent>
      </Card>
    );
  }

  const currentWeek = campaignStartDate ? getCurrentCampaignWeek(campaignStartDate) : 0;
  const streak = getConsecutiveStreak(goals);
  const hitRate = getCompletedGoalHitRate(goals);
  const hasUnpublished = goals.some(g => g.achieved !== g.published_achieved && g.achieved > 0);

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Weekly Goals
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-sm mr-2">
              {streak > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <Flame className="h-3.5 w-3.5" />
                  {streak}w streak
                </span>
              )}
              {hitRate.total > 0 && (
                <span className="text-muted-foreground">
                  {hitRate.met}/{hitRate.total} hit ({hitRate.rate}%)
                </span>
              )}
              {visibility && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={visibility.show}
                    disabled={toggleVisibility.isPending}
                    onCheckedChange={(v) => toggleVisibility.mutate(v)}
                  />
                  Client sees
                </label>
              )}
            </div>
            {editingTargets ? (
              <Button size="sm" variant="default" onClick={handleSaveTargets} disabled={updateTargetsMutation.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit Targets
                </Button>
                {hasUnpublished && (
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={() => publishAllMutation.mutate()}
                    disabled={publishAllMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Publish All
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-2">
          {goals.map((goal) => {
            const isCurrent = goal.week_number === currentWeek;
            const status = getGoalStatusColor(goal, isCurrent);
            const isUnpublished = goal.achieved !== goal.published_achieved && goal.achieved > 0;

            return (
              <div
                key={goal.id}
                className={`relative p-2 rounded-lg border text-center transition-colors ${
                  isCurrent ? "border-primary ring-1 ring-primary/30" : "border-border"
                } ${
                  status === "green" ? "bg-green-500/10"
                  : status === "red" ? "bg-red-500/10"
                  : status === "amber" ? "bg-amber-500/10"
                  : "bg-muted/30"
                }`}
              >
                <p className="text-[10px] text-muted-foreground mb-0.5">W{goal.week_number}</p>
                {editingTargets ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Target</p>
                    <Input
                      type="number"
                      min={1}
                      value={editedTargets[goal.id] ?? goal.target}
                      onChange={(e) => setEditedTargets(prev => ({
                        ...prev,
                        [goal.id]: parseInt(e.target.value) || 1,
                      }))}
                      className="h-6 text-xs text-center px-1 w-full"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {goal.achieved}/{goal.target}
                    </p>
                    {goal.published_achieved !== goal.achieved && goal.achieved > 0 && (
                      <p className="text-[9px] text-muted-foreground">
                        Client sees: {goal.published_achieved}
                      </p>
                    )}
                    <div className="mt-1">
                      {status === "green" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                      ) : status === "red" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                      ) : isCurrent ? (
                        <Clock className="h-3.5 w-3.5 text-amber-500 mx-auto" />
                      ) : null}
                    </div>
                    {isUnpublished && !editingTargets && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1 mt-1 text-[9px]"
                        onClick={() => publishWeekMutation.mutate(goal.id)}
                        disabled={publishWeekMutation.isPending}
                      >
                        <Send className="h-2.5 w-2.5 mr-0.5" />
                        Publish
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
