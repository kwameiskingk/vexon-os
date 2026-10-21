import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Calendar, User, Building, Mail, Phone, Globe, Link as LinkIcon, UserPlus, XCircle, Send, ExternalLink, PhoneCall } from "lucide-react";

import { SetUpPitchCallModal } from "./SetUpPitchCallModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface DiscoveryLog {
  id: string;
  meeting_id: string | null;
  client_name: string;
  client_email: string;
  meeting_at: string;
  outcome: string | null;
  client_interest: string | null;
  attendance_confirmed: boolean | null;
  team_network_member: boolean | null;
  contract_value: number | null;
  contract_term: string | null;
  fathom_url: string | null;
  notes: string | null;
  follow_up_date: string | null;
  converted_to_client: boolean | null;
  marked_not_proceeding: boolean | null;
  client_profile_id: string | null;
  sent_contract_at: string | null;
}

interface ViewDiscoveryCallDrawerProps {
  log: DiscoveryLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendAgreement: (log: DiscoveryLog) => void;
  isAgreementSent: boolean;
  agreementStatus?: { status: string; sent_at: string | null } | null;
}

export function ViewDiscoveryCallDrawer({
  log,
  open,
  onOpenChange,
  onSendAgreement,
  isAgreementSent,
  agreementStatus,
}: ViewDiscoveryCallDrawerProps) {
  const queryClient = useQueryClient();
  
  const [showPitchCallModal, setShowPitchCallModal] = useState(false);
  const [isMarkingNotProceeding, setIsMarkingNotProceeding] = useState(false);

  const canSendAgreement = log?.outcome === 'sat' && !log?.converted_to_client && !log?.marked_not_proceeding;
  
  const canSetupPitchCall = log?.outcome === 'sat' &&
    !log?.converted_to_client && !log?.marked_not_proceeding;
  const isAlreadyConverted = log?.converted_to_client;
  const isNotProceeding = log?.marked_not_proceeding;

  const handleMarkNotProceeding = async () => {
    if (!log) return;
    
    setIsMarkingNotProceeding(true);
    try {
      const { error } = await supabase
        .from('sales_discovery_logs')
        .update({ marked_not_proceeding: true })
        .eq('id', log.id);

      if (error) throw error;

      toast.success('Marked as not proceeding');
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['discovery-logs'] });
      queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
      queryClient.invalidateQueries({ queryKey: ['acquisition-meetings'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error marking not proceeding:', error);
      toast.error('Failed to update status');
    } finally {
      setIsMarkingNotProceeding(false);
    }
  };

  const getOutcomeBadge = (outcome: string | null, followUpDate: string | null) => {
    if (!outcome) return null;
    switch (outcome) {
      case 'sat':
        return followUpDate 
          ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sat - Follow Up Booked</Badge>
          : <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sat - No Follow Up</Badge>;
      case 'rescheduled':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Rescheduled</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelled</Badge>;
      case 'no_show':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">No Show</Badge>;
      default:
        return null;
    }
  };

  if (!log) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Discovery Call Details</SheetTitle>
            <SheetDescription>
              View outcome and take actions
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              {getOutcomeBadge(log.outcome, log.follow_up_date)}
              {isAlreadyConverted && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  ✓ Converted to Client
                </Badge>
              )}
              {isNotProceeding && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  ✗ Not Proceeding
                </Badge>
              )}
              {agreementStatus?.status === 'sent' && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Agreement Sent
                </Badge>
              )}
            </div>

            {/* Client Details */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Client Details</h3>
              
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{log.client_name}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{log.client_email}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(new Date(log.meeting_at), 'PPP')} at {format(new Date(log.meeting_at), 'p')}
                  </span>
                </div>
              </div>
            </div>

            {/* Outcome Details */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Outcome Details</h3>
              
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Meeting Status:</span>
                  <span className={`font-medium ${log.outcome === 'sat' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {log.outcome === 'sat' && log.follow_up_date ? 'Sat - Follow Up Booked' :
                     log.outcome === 'sat' && !log.follow_up_date ? 'Sat - No Follow Up' :
                     log.outcome === 'rescheduled' ? 'Rescheduled' :
                     log.outcome === 'cancelled' ? 'Cancelled' :
                     log.outcome === 'no_show' ? 'No Show' :
                     log.outcome || 'N/A'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attendance Confirmed:</span>
                  <span className="font-medium">{log.attendance_confirmed ? '✓ Yes' : '✗ No'}</span>
                </div>
                
                {log.team_network_member && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Former Team Network<span className="text-[10px] align-top">*</span>:</span>
                    <span className="font-medium text-muted-foreground">Yes (historical)</span>
                  </div>
                )}
                
                {log.contract_value && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Value:</span>
                    <span className="font-medium">£{log.contract_value.toLocaleString()}</span>
                  </div>
                )}
                
                {log.contract_term && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Term:</span>
                    <span className="font-medium">{log.contract_term}</span>
                  </div>
                )}
                
                {log.follow_up_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Follow-up Date:</span>
                    <span className="font-medium">{format(new Date(log.follow_up_date), 'PPP')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Fathom Recording */}
            {log.fathom_url && (
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <a 
                  href={log.fathom_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Fathom Recording
                </a>
              </div>
            )}

            {/* Notes */}
            {log.notes && (
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h3>
                <p className="text-sm whitespace-pre-wrap">{log.notes}</p>
              </div>
            )}

            <Separator />

            {/* Action Buttons */}
            {!isNotProceeding && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
                <div className="flex flex-col gap-2">
                  {/* Set up Pitch Call Button */}
                  {canSetupPitchCall && (
                    <Button
                      variant="outline"
                      onClick={() => setShowPitchCallModal(true)}
                      className="w-full justify-start border-primary/50 hover:bg-primary/10"
                    >
                      <PhoneCall className="mr-2 h-4 w-4" />
                      Set up Pitch Call
                    </Button>
                  )}

                  {canSendAgreement && (
                    <Button
                      variant="outline"
                      onClick={() => onSendAgreement(log)}
                      disabled={isAgreementSent}
                      className="w-full justify-start"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {isAgreementSent ? 'Agreement Sent' : 'Send Agreement'}
                    </Button>
                  )}
                  

                  <Button
                    variant="destructive"
                    onClick={handleMarkNotProceeding}
                    disabled={isMarkingNotProceeding}
                    className="w-full justify-start"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {isMarkingNotProceeding ? 'Updating...' : 'Mark as Not Proceeding'}
                  </Button>
                </div>
              </div>
            )}

            {/* Close Button */}
            <div className="pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>


      {/* Set Up Pitch Call Modal */}
      {log && (
        <SetUpPitchCallModal
          log={log}
          open={showPitchCallModal}
          onOpenChange={setShowPitchCallModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
            setShowPitchCallModal(false);
          }}
        />
      )}
    </>
  );
}
