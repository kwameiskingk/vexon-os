import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Trophy, Calendar, Gift, Trash2, Edit2, Check, X, Crown, Users, BarChart3, Database, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface BonusChallengeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bonus: any;
  isAdmin?: boolean;
}

export const BonusChallengeDetailModal = ({ open, onOpenChange, bonus, isAdmin = false }: BonusChallengeDetailModalProps) => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [trackingSource, setTrackingSource] = useState<string>(bonus?.tracking_source || 'app');

  const daysLeft = bonus ? differenceInDays(new Date(bonus.end_date), new Date()) : 0;
  const isExpired = daysLeft < 0;
  const isPendingApproval = bonus?.status === 'pending_approval';
  const isCompleted = bonus?.status === 'completed';

  // Fetch setter meeting counts based on tracking source
  const { data: setterProgress = [] } = useQuery({
    queryKey: ['bonus-setter-progress', bonus?.id, trackingSource],
    queryFn: async () => {
      if (!bonus) return [];

      const startDate = bonus.start_date;
      const endDate = bonus.end_date;

      if (trackingSource === 'app') {
        // Count meetings from the meetings table
        const { data: meetings, error } = await supabase
          .from('meetings')
          .select('logged_by_setter_id, setter_id')
          .gte('meeting_date', startDate)
          .lte('meeting_date', endDate)
          .or('is_rebook.is.null,is_rebook.eq.false');

        if (error) throw error;

        // Group by setter
        const setterCounts: Record<string, number> = {};
        (meetings || []).forEach((m: any) => {
          const setterId = m.logged_by_setter_id || m.setter_id;
          if (setterId) {
            setterCounts[setterId] = (setterCounts[setterId] || 0) + 1;
          }
        });

        // Get setter profiles
        const setterIds = Object.keys(setterCounts);
        if (setterIds.length === 0) return [];

        const { data: profiles } = await supabase
          .from('setters_profiles')
          .select('user_id, full_name, email')
          .in('user_id', setterIds)
          .eq('active', true)
          .neq('department', 'sales'); // AE telemetry rows never rank in challenges

        return (profiles || []).map((p: any) => ({
          email: p.email,
          name: p.full_name || p.email,
          meetings: setterCounts[p.user_id] || 0,
        })).sort((a: any, b: any) => b.meetings - a.meetings);
      } else {
        // Use performance table (Google Sheets data)
        const { data: perf, error } = await supabase
          .from('performance')
          .select('email, meetings_booked')
          .gte('date', startDate)
          .lte('date', endDate);

        if (error) throw error;

        // Get active setters
        const { data: activeSetters } = await supabase
          .from('setters_profiles')
          .select('email, full_name')
          .eq('active', true)
          .neq('department', 'sales'); // AE telemetry rows never rank in challenges

        const activeEmails = new Set((activeSetters || []).map((s: any) => s.email?.toLowerCase()));
        const nameMap: Record<string, string> = {};
        (activeSetters || []).forEach((s: any) => {
          if (s.email) nameMap[s.email.toLowerCase()] = s.full_name || s.email;
        });

        // Aggregate
        const emailCounts: Record<string, number> = {};
        (perf || []).forEach((p: any) => {
          const email = (p.email || '').toLowerCase();
          if (activeEmails.has(email)) {
            emailCounts[email] = (emailCounts[email] || 0) + (p.meetings_booked || 0);
          }
        });

        return Object.entries(emailCounts)
          .map(([email, meetings]) => ({
            email,
            name: nameMap[email] || email,
            meetings,
          }))
          .sort((a, b) => b.meetings - a.meetings);
      }
    },
    enabled: !!bonus && open,
  });

  // Update tracking source
  const updateTrackingMutation = useMutation({
    mutationFn: async (source: string) => {
      const { error } = await supabase
        .from('leaderboard_bonuses' as any)
        .update({ tracking_source: source } as any)
        .eq('id', bonus.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-bonuses'] });
      toast.success('Tracking source updated');
    },
  });

  // Edit bonus
  const editMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('leaderboard_bonuses' as any)
        .update({
          title: data.title,
          description: data.description,
          amount: data.amount,
          type: data.type,
          reward_type: data.reward_type,
          meeting_goal: data.meeting_goal ? parseInt(data.meeting_goal) : null,
        } as any)
        .eq('id', bonus.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-bonuses'] });
      toast.success('Challenge updated');
      setIsEditing(false);
    },
    onError: () => toast.error('Failed to update'),
  });

  // Delete bonus
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('leaderboard_bonuses' as any)
        .delete()
        .eq('id', bonus.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-bonuses'] });
      toast.success('Challenge deleted');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to delete'),
  });

  // Approve winner
  const approveWinnerMutation = useMutation({
    mutationFn: async (winnerEmail: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('leaderboard_bonuses' as any)
        .update({
          winner_email: winnerEmail,
          winner_approved_by: user?.id,
          winner_approved_at: new Date().toISOString(),
          status: 'completed',
          active: false,
        } as any)
        .eq('id', bonus.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-bonuses'] });
      toast.success('Winner approved and notified! 🎉');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to approve winner'),
  });

  // End challenge (move to pending_approval)
  const endChallengeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('leaderboard_bonuses' as any)
        .update({ status: 'pending_approval' } as any)
        .eq('id', bonus.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-bonuses'] });
      toast.success('Challenge ended. All admins have been notified to approve a winner.');
    },
    onError: () => toast.error('Failed to end challenge'),
  });

  const handleTrackingToggle = (checked: boolean) => {
    const newSource = checked ? 'sheets' : 'app';
    setTrackingSource(newSource);
    updateTrackingMutation.mutate(newSource);
  };

  const startEditing = () => {
    setEditData({
      title: bonus.title,
      description: bonus.description,
      amount: bonus.amount,
      type: bonus.type,
      reward_type: bonus.reward_type || 'cash',
      meeting_goal: bonus.meeting_goal || '',
    });
    setIsEditing(true);
  };

  if (!bonus) return null;

  const leader = setterProgress[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Gift className="h-5 w-5 text-primary" />
              {bonus.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {isExpired && !isCompleted && (
                <Badge variant="destructive">Expired</Badge>
              )}
              {isPendingApproval && (
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Pending Approval</Badge>
              )}
              {isCompleted && (
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Completed</Badge>
              )}
              {!isExpired && !isPendingApproval && !isCompleted && (
                <Badge className="bg-primary/10 text-primary border-primary/30">Active</Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Challenge Info */}
        {!isEditing ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{bonus.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {format(new Date(bonus.start_date), 'MMM d')} – {format(new Date(bonus.end_date), 'MMM d, yyyy')}
              </span>
              <span className="font-semibold text-primary">
                {bonus.reward_type === 'cash' ? `$${bonus.amount}` : bonus.amount} reward
              </span>
              {bonus.meeting_goal && (
                <span className="text-muted-foreground">Goal: {bonus.meeting_goal} meetings</span>
              )}
              {!isExpired && !isCompleted && (
                <span className="text-muted-foreground">{daysLeft} days left</span>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={editData.type} onValueChange={(v) => setEditData({ ...editData, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Meeting Goal</Label>
                <Input type="number" value={editData.meeting_goal} onChange={(e) => setEditData({ ...editData, meeting_goal: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => editMutation.mutate(editData)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Tracking Source Toggle */}
        {isAdmin && !isCompleted && (
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              {trackingSource === 'app' ? (
                <Database className="h-4 w-4 text-primary" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
              )}
              <div>
                <p className="text-sm font-medium">Tracking Source</p>
                <p className="text-xs text-muted-foreground">
                  {trackingSource === 'app' ? 'In-App Meetings Logged' : 'Google Sheets Synced Data'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs", trackingSource === 'app' ? "text-primary font-medium" : "text-muted-foreground")}>App</span>
              <Switch
                checked={trackingSource === 'sheets'}
                onCheckedChange={handleTrackingToggle}
              />
              <span className={cn("text-xs", trackingSource === 'sheets' ? "text-emerald-500 font-medium" : "text-muted-foreground")}>Sheets</span>
            </div>
          </div>
        )}

        {/* Winner Banner */}
        {isCompleted && bonus.winner_email && (
          <div className="rounded-lg bg-gradient-to-r from-amber-500/10 to-primary/10 border border-amber-500/30 p-4 flex items-center gap-3">
            <Crown className="h-6 w-6 text-amber-500" />
            <div>
              <p className="font-semibold">🏆 Winner: {bonus.winner_email}</p>
              {bonus.winner_approved_at && (
                <p className="text-xs text-muted-foreground">
                  Approved on {format(new Date(bonus.winner_approved_at), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Setter Progress */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Setter Progress</h3>
            <Badge variant="secondary" className="text-xs">{setterProgress.length} setters</Badge>
          </div>

          {setterProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No meetings logged during this period yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {setterProgress.map((setter: any, idx: number) => {
                const isLeader = idx === 0;
                const goalPct = bonus.meeting_goal ? Math.min((setter.meetings / bonus.meeting_goal) * 100, 100) : null;

                return (
                  <div
                    key={setter.email}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 transition-colors",
                      isLeader && "border-amber-500/30 bg-amber-500/5",
                      !isLeader && "border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                        isLeader ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{setter.name}</p>
                        <p className="text-xs text-muted-foreground">{setter.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {goalPct !== null && (
                        <div className="w-24">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${goalPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground text-right mt-0.5">{Math.round(goalPct)}%</p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-lg font-bold">{setter.meetings}</p>
                        <p className="text-[10px] text-muted-foreground">meetings</p>
                      </div>
                      {isAdmin && (isPendingApproval || isExpired) && !isCompleted && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => approveWinnerMutation.mutate(setter.email)}
                        >
                          <Crown className="h-3 w-3 mr-1" /> Approve
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin Actions */}
        {isAdmin && !isCompleted && (
          <>
            <Separator />
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={startEditing} disabled={isEditing}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this challenge?')) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
              {!isPendingApproval && (
                <Button
                  size="sm"
                  onClick={() => endChallengeMutation.mutate()}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  <Trophy className="h-3.5 w-3.5 mr-1" /> End Challenge & Pick Winner
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
