import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, CheckCircle, Clock, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SDRManagerOnboarding = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedbackModal, setFeedbackModal] = useState<{
    setterId: string;
    setterName: string;
    day: number;
  } | null>(null);
  const [feedback, setFeedback] = useState("");

  // Fetch trainees (setters with status = 'trainee')
  const { data: trainees, isLoading } = useQuery({
    queryKey: ['sdr-manager-trainees', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const managedIds = await fetchManagedSetterProfileIds(user.id);
      const { data: managedProfiles } = managedIds.length
        ? await supabase
            .from('setters_profiles')
            .select('id, full_name, email, status, created_at')
            .in('id', managedIds)
        : { data: [] };
      const assignments = (managedProfiles ?? []).map((p: any) => ({
        setter_profile_id: p.id,
        setters_profiles: p,
      }));

      // Filter to trainees only
      const traineeAssignments = assignments.filter(
        a => (a.setters_profiles as any)?.status === 'trainee'
      );

      // Get onboarding checklists
      const traineeIds = traineeAssignments.map(a => (a.setters_profiles as any)?.id);
      
      const { data: checklists } = await supabase
        .from('setter_onboarding_checklist')
        .select('*')
        .in('setter_profile_id', traineeIds);

      return traineeAssignments.map(a => {
        const profile = a.setters_profiles as any;
        const startDate = new Date(profile?.created_at);
        const onboardingDay = Math.min(14, Math.max(1, differenceInDays(new Date(), startDate) + 1));
        
        const setterChecklists = checklists?.filter(c => c.setter_profile_id === profile?.id) || [];
        const completedDays = setterChecklists.filter(c => c.status === 'completed').length;
        const progress = Math.round((completedDays / 14) * 100);

        return {
          id: profile?.id,
          full_name: profile?.full_name,
          email: profile?.email,
          onboarding_day: onboardingDay,
          progress,
          checklists: setterChecklists,
          completedDays
        };
      });
    },
    enabled: !!user?.id
  });

  // Fetch recently completed onboarding (last 30 days)
  const { data: recentlyCompleted } = useQuery({
    queryKey: ['sdr-manager-recently-completed', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const managedIds = await fetchManagedSetterProfileIds(user.id);
      const { data: managedProfiles } = managedIds.length
        ? await supabase
            .from('setters_profiles')
            .select('id, full_name, status, status_changed_at')
            .in('id', managedIds)
        : { data: [] };
      const assignments = (managedProfiles ?? []).map((p: any) => ({
        setter_profile_id: p.id,
        setters_profiles: p,
      }));

      // Filter to active setters who were recently trainees
      return assignments
        .filter(a => {
          const profile = a.setters_profiles as any;
          if (profile?.status !== 'active') return false;
          if (!profile?.status_changed_at) return false;
          const changedDays = differenceInDays(new Date(), new Date(profile.status_changed_at));
          return changedDays <= 30;
        })
        .map(a => ({
          id: (a.setters_profiles as any)?.id,
          full_name: (a.setters_profiles as any)?.full_name,
          completed_at: (a.setters_profiles as any)?.status_changed_at
        }));
    },
    enabled: !!user?.id
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async ({ 
      setterId, 
      day, 
      field, 
      value 
    }: { 
      setterId: string; 
      day: number; 
      field: string; 
      value: boolean;
    }) => {
      // First try to get existing record
      const { data: existing } = await supabase
        .from('setter_onboarding_checklist')
        .select('id')
        .eq('setter_profile_id', setterId)
        .eq('onboarding_day', day)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('setter_onboarding_checklist')
          .update({ [field]: value })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('setter_onboarding_checklist')
          .insert({
            setter_profile_id: setterId,
            manager_user_id: user?.id,
            onboarding_day: day,
            [field]: value
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-trainees'] });
    },
    onError: (error) => {
      toast.error('Failed to update checklist');
      console.error(error);
    }
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async () => {
      if (!feedbackModal) return;

      const { data: existing } = await supabase
        .from('setter_onboarding_checklist')
        .select('id')
        .eq('setter_profile_id', feedbackModal.setterId)
        .eq('onboarding_day', feedbackModal.day)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('setter_onboarding_checklist')
          .update({ 
            manager_feedback: feedback,
            status: 'completed'
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('setter_onboarding_checklist')
          .insert({
            setter_profile_id: feedbackModal.setterId,
            manager_user_id: user?.id,
            onboarding_day: feedbackModal.day,
            manager_feedback: feedback,
            status: 'completed'
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Feedback submitted');
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-trainees'] });
      setFeedbackModal(null);
      setFeedback("");
    },
    onError: (error) => {
      toast.error('Failed to submit feedback');
      console.error(error);
    }
  });

  const getChecklistForDay = (checklists: any[], day: number) => {
    return checklists.find(c => c.onboarding_day === day) || {};
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
      <PageHeader
        title="Onboarding & Training"
        subtitle="Oversee new hire progress through Days 1-14"
      />

      {/* Active Trainees */}
      <Card className="mb-6 bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Trainees in Onboarding ({trainees?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : trainees && trainees.length > 0 ? (
            <div className="space-y-6">
              {trainees.map(trainee => {
                const todayChecklist = getChecklistForDay(trainee.checklists, trainee.onboarding_day);
                
                return (
                  <div key={trainee.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-medium">{trainee.full_name}</h3>
                        <p className="text-sm text-muted-foreground">Day {trainee.onboarding_day} of 14</p>
                      </div>
                      <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        Trainee
                      </Badge>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span>{trainee.progress}%</span>
                      </div>
                      <Progress value={trainee.progress} className="h-2" />
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          id={`calls-${trainee.id}`}
                          checked={todayChecklist.listened_to_calls || false}
                          onCheckedChange={(checked) => {
                            updateChecklistMutation.mutate({
                              setterId: trainee.id,
                              day: trainee.onboarding_day,
                              field: 'listened_to_calls',
                              value: !!checked
                            });
                          }}
                        />
                        <label htmlFor={`calls-${trainee.id}`} className="text-sm">
                          Listened to required calls
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          id={`script-${trainee.id}`}
                          checked={todayChecklist.script_review_completed || false}
                          onCheckedChange={(checked) => {
                            updateChecklistMutation.mutate({
                              setterId: trainee.id,
                              day: trainee.onboarding_day,
                              field: 'script_review_completed',
                              value: !!checked
                            });
                          }}
                        />
                        <label htmlFor={`script-${trainee.id}`} className="text-sm">
                          Script review completed
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          id={`roleplay-${trainee.id}`}
                          checked={todayChecklist.roleplay_passed || false}
                          onCheckedChange={(checked) => {
                            updateChecklistMutation.mutate({
                              setterId: trainee.id,
                              day: trainee.onboarding_day,
                              field: 'roleplay_passed',
                              value: !!checked
                            });
                          }}
                        />
                        <label htmlFor={`roleplay-${trainee.id}`} className="text-sm">
                          Roleplay benchmark passed
                        </label>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeedbackModal({
                        setterId: trainee.id,
                        setterName: trainee.full_name,
                        day: trainee.onboarding_day
                      })}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Add Daily Feedback
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No trainees currently in onboarding</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently Completed */}
      {recentlyCompleted && recentlyCompleted.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Recently Completed (Last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentlyCompleted.map(setter => (
                <div key={setter.id} className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <span className="font-medium">{setter.full_name}</span>
                  <span className="text-sm text-muted-foreground">
                    Transitioned {format(new Date(setter.completed_at), 'MMM d')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Modal */}
      <Dialog open={!!feedbackModal} onOpenChange={() => setFeedbackModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Daily Feedback - {feedbackModal?.setterName} (Day {feedbackModal?.day})
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Enter your feedback for today's performance..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackModal(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => submitFeedbackMutation.mutate()}
              disabled={!feedback.trim() || submitFeedbackMutation.isPending}
            >
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerOnboarding;
