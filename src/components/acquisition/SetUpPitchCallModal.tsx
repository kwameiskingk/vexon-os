import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DiscoveryLog {
  id: string;
  client_name: string;
  client_email: string;
  outcome: string | null;
  client_interest: string | null;
  contract_value: number | null;
  contract_term: string | null;
  fathom_url: string | null;
  notes: string | null;
}

interface SetUpPitchCallModalProps {
  log: DiscoveryLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SetUpPitchCallModal({
  log,
  open,
  onOpenChange,
  onSuccess,
}: SetUpPitchCallModalProps) {
  const [pitchDate, setPitchDate] = useState<Date | undefined>(undefined);
  const [pitchTime, setPitchTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!log || !pitchDate) {
      toast.error("Please select a date for the pitch call");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('pitch_calls').insert({
        discovery_log_id: log.id,
        client_name: log.client_name,
        client_email: log.client_email,
        company_name: log.client_name,
        pitch_call_date: format(pitchDate, 'yyyy-MM-dd'),
        pitch_call_time: pitchTime,
        original_outcome: log.outcome,
        original_interest: log.client_interest,
        contract_value: log.contract_value,
        contract_term: log.contract_term,
        fathom_url: log.fathom_url,
        notes: log.notes,
        status: 'scheduled',
        created_by: user?.id,
      });

      if (error) throw error;
      
      // Increment the follow_up_count on the discovery log
      const { error: updateError } = await supabase
        .from('sales_discovery_logs')
        .update({ follow_up_count: (log as any).follow_up_count ? (log as any).follow_up_count + 1 : 1 })
        .eq('id', log.id);
      
      if (updateError) {
        console.error("Error updating follow_up_count:", updateError);
      }

      toast.success("Follow-up call scheduled successfully");
      onSuccess();
      onOpenChange(false);
      setPitchDate(undefined);
      setPitchTime("09:00");
    } catch (error: any) {
      console.error("Error scheduling pitch call:", error);
      toast.error(error.message || "Failed to schedule pitch call");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Follow-Up Call</DialogTitle>
          <DialogDescription>
            Schedule a follow-up call with {log.client_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client Info Summary */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">Client</p>
            <p className="font-medium">{log.client_name}</p>
            <p className="text-sm text-muted-foreground">{log.client_email}</p>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label>Follow-Up Call Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !pitchDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {pitchDate ? format(pitchDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={pitchDate}
                  onSelect={setPitchDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Input */}
          <div className="space-y-2">
            <Label>Time</Label>
            <Input
              type="time"
              value={pitchTime}
              onChange={(e) => setPitchTime(e.target.value)}
            />
          </div>

          {/* Original Discovery Details */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-2">
            <p className="text-sm font-medium text-muted-foreground">From Discovery Call</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Interest: </span>
                <span className={cn(
                  "font-medium",
                  log.client_interest === 'interested' && "text-green-400",
                  log.client_interest === 'unsure' && "text-yellow-400"
                )}>
                  {log.client_interest || 'N/A'}
                </span>
              </div>
              {log.contract_value && (
                <div>
                  <span className="text-muted-foreground">Value: </span>
                  <span className="font-medium">£{log.contract_value.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!pitchDate || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              "Schedule Follow-Up Call"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
