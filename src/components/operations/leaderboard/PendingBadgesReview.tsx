import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Star, Zap, Flame, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const achievementConfig: Record<string, { icon: any; color: string; label: string }> = {
  power_booker: {
    icon: Star,
    color: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
    label: "Power Booker"
  },
  elite_closer: {
    icon: Zap,
    color: "bg-purple-500/20 text-purple-600 border-purple-500/30",
    label: "Elite Closer"
  },
  machine_mode: {
    icon: Flame,
    color: "bg-orange-500/20 text-orange-600 border-orange-500/30",
    label: "Machine Mode"
  },
  lead_magnet: {
    icon: Target,
    color: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    label: "Lead Magnet"
  },
  rising_star: {
    icon: TrendingUp,
    color: "bg-green-500/20 text-green-600 border-green-500/30",
    label: "Rising Star"
  }
};

export const PendingBadgesReview = () => {
  const queryClient = useQueryClient();

  const { data: pendingBadges, isLoading } = useQuery({
    queryKey: ['pending-badges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_badge_proposals')
        .select('*')
        .eq('status', 'pending')
        .order('proposed_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const approveBadgeMutation = useMutation({
    mutationFn: async (proposal: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert into achievements
      const { error: achievementError } = await supabase
        .from('leaderboard_achievements')
        .insert({
          email: proposal.email,
          achievement_key: proposal.achievement_key,
          date_awarded: new Date().toISOString().split('T')[0]
        });
      
      if (achievementError) throw achievementError;

      // Update proposal status
      const { error: updateError } = await supabase
        .from('pending_badge_proposals')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', proposal.id);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-badges'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-achievements'] });
      toast.success('Badge approved and assigned!');
    },
    onError: () => {
      toast.error('Failed to approve badge');
    }
  });

  const rejectBadgeMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('pending_badge_proposals')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', proposalId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-badges'] });
      toast.success('Badge proposal rejected');
    },
    onError: () => {
      toast.error('Failed to reject badge');
    }
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading pending badges...</div>;
  }

  if (!pendingBadges || pendingBadges.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          Pending Badge Approvals ({pendingBadges.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingBadges.map((proposal) => {
          const config = achievementConfig[proposal.achievement_key];
          if (!config) return null;
          
          const Icon = config.icon;

          return (
            <div
              key={proposal.id}
              className="p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={`${config.color} flex items-center gap-1.5`}>
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </Badge>
                  </div>
                  <p className="font-semibold text-lg">{proposal.email}</p>
                  <p className="text-sm text-muted-foreground mt-1">{proposal.reason}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Proposed {format(new Date(proposal.proposed_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/30 hover:bg-green-500/10 text-green-600"
                    onClick={() => approveBadgeMutation.mutate(proposal)}
                    disabled={approveBadgeMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 hover:bg-red-500/10 text-red-600"
                    onClick={() => rejectBadgeMutation.mutate(proposal.id)}
                    disabled={rejectBadgeMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
