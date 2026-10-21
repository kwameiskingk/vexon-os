import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Check, Trophy } from "lucide-react";
import { useState } from "react";

interface ManageRivalriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManageRivalriesModal = ({ open, onOpenChange }: ManageRivalriesModalProps) => {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: rivalries, isLoading } = useQuery({
    queryKey: ['admin-rivalries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('*')
        .not('rival_email', 'is', null);
      
      if (error) throw error;
      
      // Deduplicate rivalries - only show each pair once
      const seen = new Set<string>();
      const unique = (data || []).filter(profile => {
        const pairKey = [profile.email, profile.rival_email].sort().join('|');
        if (seen.has(pairKey)) return false;
        seen.add(pairKey);
        return true;
      });
      
      return unique;
    },
    enabled: open
  });

  const handleApproveEnd = async (userEmail: string, rivalEmail: string, userId: string) => {
    setProcessing(userId);
    try {
      // Look up both profiles to get user IDs for notifications
      const { data: userProfile } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name')
        .eq('email', userEmail)
        .single();

      const { data: rivalProfile } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name')
        .eq('email', rivalEmail)
        .single();

      // End both rivalries
      const { error: error1 } = await supabase
        .from('setters_profiles')
        .update({ 
          rival_email: null,
          rivalry_started_at: null,
          rivalry_end_pending: false,
          rivalry_end_date: null,
          rivalry_reward_amount: null,
          last_rivalry_ended_at: new Date().toISOString()
        })
        .eq('email', userEmail);

      const { error: error2 } = await supabase
        .from('setters_profiles')
        .update({ 
          rival_email: null,
          rivalry_started_at: null,
          rivalry_end_pending: false,
          rivalry_end_date: null,
          rivalry_reward_amount: null,
          last_rivalry_ended_at: new Date().toISOString()
        })
        .eq('email', rivalEmail);

      if (error1 || error2) throw error1 || error2;

      // Notify both setters that the rivalry has ended
      const notifications: any[] = [];
      if (userProfile?.user_id) {
        notifications.push({
          recipient_id: userProfile.user_id,
          recipient_role: 'setter',
          title: 'Rivalry Ended',
          message: 'Your rivalry has been ended by an admin.',
          category: 'system',
          link_url: '/setter'
        });
      }
      if (rivalProfile?.user_id) {
        notifications.push({
          recipient_id: rivalProfile.user_id,
          recipient_role: 'setter',
          title: 'Rivalry Ended',
          message: 'Your rivalry has been ended by an admin.',
          category: 'system',
          link_url: '/setter'
        });
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }

      toast.success('Rivalry ended successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-rivalries'] });
      queryClient.invalidateQueries({ queryKey: ['setters-profiles-gamification'] });
    } catch (error) {
      console.error('Error ending rivalry:', error);
      toast.error('Failed to end rivalry');
    } finally {
      setProcessing(null);
    }
  };

  const handleForceEnd = async (userEmail: string, rivalEmail: string, userId: string) => {
    setProcessing(userId);
    try {
      // Look up both profiles to get user IDs for notifications
      const { data: userProfile } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name')
        .eq('email', userEmail)
        .single();

      const { data: rivalProfile } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name')
        .eq('email', rivalEmail)
        .single();

      // Force end both sides
      const { error: error1 } = await supabase
        .from('setters_profiles')
        .update({ 
          rival_email: null,
          rivalry_started_at: null,
          rivalry_end_pending: false,
          rivalry_end_date: null,
          rivalry_reward_amount: null,
          last_rivalry_ended_at: new Date().toISOString()
        })
        .eq('email', userEmail);

      const { error: error2 } = await supabase
        .from('setters_profiles')
        .update({ 
          rival_email: null,
          rivalry_started_at: null,
          rivalry_end_pending: false,
          rivalry_end_date: null,
          rivalry_reward_amount: null,
          last_rivalry_ended_at: new Date().toISOString()
        })
        .eq('email', rivalEmail);

      if (error1 || error2) throw error1 || error2;

      // Notify both setters that the rivalry has been force ended
      const notifications: any[] = [];
      if (userProfile?.user_id) {
        notifications.push({
          recipient_id: userProfile.user_id,
          recipient_role: 'setter',
          title: 'Rivalry Force Ended',
          message: 'Your rivalry has been force ended by an admin.',
          category: 'system',
          link_url: '/setter'
        });
      }
      if (rivalProfile?.user_id) {
        notifications.push({
          recipient_id: rivalProfile.user_id,
          recipient_role: 'setter',
          title: 'Rivalry Force Ended',
          message: 'Your rivalry has been force ended by an admin.',
          category: 'system',
          link_url: '/setter'
        });
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }

      toast.success('Rivalry force ended');
      queryClient.invalidateQueries({ queryKey: ['admin-rivalries'] });
      queryClient.invalidateQueries({ queryKey: ['setters-profiles-gamification'] });
    } catch (error) {
      console.error('Error force ending rivalry:', error);
      toast.error('Failed to force end rivalry');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-purple-500" />
            Manage Rivalries
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading rivalries...</div>
        ) : !rivalries || rivalries.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No active rivalries</div>
        ) : (
          <div className="space-y-4">
            {rivalries.map((rivalry) => (
              <div key={rivalry.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{rivalry.full_name || rivalry.email}</p>
                    <p className="text-sm text-muted-foreground">vs {rivalry.rival_email}</p>
                  </div>
                  {rivalry.rivalry_end_pending && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                      End Requested
                    </Badge>
                  )}
                </div>

                {rivalry.rivalry_reward_amount && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reward: </span>
                    <span className="font-semibold">${rivalry.rivalry_reward_amount}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {rivalry.rivalry_end_pending ? (
                    <Button
                      size="sm"
                      onClick={() => handleApproveEnd(rivalry.email, rivalry.rival_email, rivalry.user_id)}
                      disabled={processing === rivalry.user_id}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve End
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleForceEnd(rivalry.email, rivalry.rival_email, rivalry.user_id)}
                      disabled={processing === rivalry.user_id}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Force End
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
