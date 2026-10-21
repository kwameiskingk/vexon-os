import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Calendar, Building, Mail, ExternalLink, Loader2, XCircle, Phone, ClipboardCheck, Trophy, CalendarPlus } from "lucide-react";
import { MarkAsWonModal } from "./MarkAsWonModal";
import { PostPitchCallFeedbackForm } from "@/components/ae/PostPitchCallFeedbackForm";
import { CreatePitchCallModal } from "./CreatePitchCallModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface PitchCall {
  id: string;
  discovery_log_id: string | null;
  client_name: string;
  client_email: string;
  company_name: string | null;
  pitch_call_date: string;
  pitch_call_time: string | null;
  original_outcome: string | null;
  original_interest: string | null;
  contract_value: number | null;
  contract_term: string | null;
  fathom_url: string | null;
  notes: string | null;
  status: string | null;
  pitch_outcome: string | null;
  pitch_interest: string | null;
  converted_to_client: boolean | null;
  marked_not_proceeding: boolean | null;
  has_feedback: boolean | null;
}

interface CompletePitchCallDrawerProps {
  pitchCall: PitchCall | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CompletePitchCallDrawer({
  pitchCall,
  open,
  onOpenChange,
  onSuccess,
}: CompletePitchCallDrawerProps) {
  const queryClient = useQueryClient();
  const [showWonModal, setShowWonModal] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [showScheduleFollowUp, setShowScheduleFollowUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMarkingNotProceeding, setIsMarkingNotProceeding] = useState(false);

  // Form state
  const [pitchOutcome, setPitchOutcome] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const isCompleted = pitchCall?.status === 'completed';
  const isConverted = pitchCall?.converted_to_client;
  const isNotProceeding = pitchCall?.marked_not_proceeding;
  const canComplete = !!pitchOutcome;

  // Reset form when pitchCall changes
  useEffect(() => {
    if (pitchCall) {
      setPitchOutcome(pitchCall.pitch_outcome || "");
      setNotes(pitchCall.notes || "");
    }
  }, [pitchCall?.id]);

  const handleSave = async () => {
    if (!pitchCall || !pitchOutcome) {
      toast.error("Please select a status");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pitch_calls')
        .update({
          pitch_outcome: pitchOutcome,
          notes: notes,
          status: 'completed',
        })
        .eq('id', pitchCall.id);

      if (error) throw error;

      toast.success("Follow-up call completed — now complete your feedback");
      onSuccess();
      setShowFeedbackForm(true);
    } catch (error: any) {
      console.error("Error saving pitch call:", error);
      toast.error(error.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkNotProceeding = async () => {
    if (!pitchCall) return;

    setIsMarkingNotProceeding(true);
    try {
      const { error } = await supabase
        .from('pitch_calls')
        .update({ 
          marked_not_proceeding: true,
          status: 'completed'
        })
        .eq('id', pitchCall.id);

      if (error) throw error;

      toast.success("Marked as not proceeding");
      queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
      queryClient.invalidateQueries({ queryKey: ['ae-pitch-calls'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error marking not proceeding:", error);
      toast.error("Failed to update status");
    } finally {
      setIsMarkingNotProceeding(false);
    }
  };

  if (!pitchCall) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              {isCompleted ? "Follow-Up Call Details" : "Complete Follow-Up Call"}
            </SheetTitle>
            <SheetDescription>
              {isCompleted ? "View outcome and take actions" : "Record the outcome of this follow-up call"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              {isConverted && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  ✓ Won — Sent to Onboarding
                </Badge>
              )}
              {isNotProceeding && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  ✗ Not Proceeding
                </Badge>
              )}
              {isCompleted && !isConverted && !isNotProceeding && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Completed
                </Badge>
              )}
            </div>

            {/* Client Details */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Client Details</h3>
              
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{pitchCall.client_name}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{pitchCall.client_email}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(new Date(pitchCall.pitch_call_date), 'PPP')}
                    {pitchCall.pitch_call_time && ` at ${pitchCall.pitch_call_time.slice(0, 5)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Deal Summary - always shown */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Deal Summary</h3>
              <div className="grid gap-3 text-sm">
                {pitchCall.contract_value && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Value:</span>
                    <span className="font-medium">£{pitchCall.contract_value.toLocaleString()}</span>
                  </div>
                )}
                {pitchCall.contract_term && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Term:</span>
                    <span className="font-medium">{pitchCall.contract_term}</span>
                  </div>
                )}
                {pitchCall.pitch_outcome && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outcome:</span>
                    <span className="font-medium">
                      {pitchCall.pitch_outcome === 'sat' ? 'Sat - Completed' : 
                       pitchCall.pitch_outcome === 'rescheduled' ? 'Rescheduled' :
                       pitchCall.pitch_outcome === 'cancelled' ? 'Cancelled' :
                       pitchCall.pitch_outcome === 'no_show' ? 'No Show' : pitchCall.pitch_outcome}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Fathom Recording Link */}
            {pitchCall.fathom_url && (
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <a 
                  href={pitchCall.fathom_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Fathom Recording
                </a>
              </div>
            )}

            {/* Notes (read-only for completed) */}
            {isCompleted && pitchCall.notes && (
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h3>
                <p className="text-sm whitespace-pre-wrap">{pitchCall.notes}</p>
              </div>
            )}

            {/* Completion Form - only for non-completed */}
            {!isCompleted && !isNotProceeding && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Follow-Up Call Outcome</h3>
                  
                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select value={pitchOutcome} onValueChange={setPitchOutcome}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sat">Sat - Completed</SelectItem>
                        <SelectItem value="rescheduled">Rescheduled</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="no_show">No Show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any notes from the follow-up call..."
                      rows={3}
                    />
                  </div>

                  <Button 
                    onClick={handleSave} 
                    disabled={!canComplete || isSaving}
                    className="w-full"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Mark as Complete"
                    )}
                  </Button>
                </div>
              </>
            )}

            <Separator />

            {/* Action Buttons for completed calls */}
            {!isNotProceeding && !isConverted && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
                <div className="flex flex-col gap-2">
                  {isCompleted && !pitchCall.has_feedback && (
                    <Button
                      variant="outline"
                      onClick={() => setShowFeedbackForm(true)}
                      className="w-full justify-start"
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      Submit Follow-Up Call Feedback
                    </Button>
                  )}
                  {isCompleted && pitchCall.has_feedback && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 w-fit">
                      ✓ Feedback Submitted
                    </Badge>
                  )}

                  <Button
                    onClick={() => setShowWonModal(true)}
                    className="w-full justify-start bg-green-600 hover:bg-green-700"
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    Mark as Won
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowScheduleFollowUp(true)}
                    className="w-full justify-start"
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Schedule Another Follow-Up
                  </Button>

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

      {/* Mark as Won Modal */}
      {pitchCall && (
        <MarkAsWonModal
          pitchCall={pitchCall}
          open={showWonModal}
          onOpenChange={setShowWonModal}
          onSuccess={() => {
            onSuccess();
            onOpenChange(false);
          }}
        />
      )}

      {/* Schedule Follow-Up */}
      {pitchCall && (
        <CreatePitchCallModal
          open={showScheduleFollowUp}
          onOpenChange={setShowScheduleFollowUp}
          prefillData={{
            client_name: pitchCall.client_name,
            client_email: pitchCall.client_email,
            company_name: pitchCall.company_name,
            contract_value: pitchCall.contract_value,
            contract_term: pitchCall.contract_term,
            discovery_log_id: pitchCall.discovery_log_id,
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['ae-pitch-calls'] });
            queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
          }}
        />
      )}

      {/* Post Pitch Call Feedback Form */}
      {pitchCall && (
        <PostPitchCallFeedbackForm
          pitchCall={pitchCall}
          open={showFeedbackForm}
          onOpenChange={setShowFeedbackForm}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
            queryClient.invalidateQueries({ queryKey: ['ae-pitch-calls'] });
          }}
        />
      )}
    </>
  );
}
