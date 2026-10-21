import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ConfirmOutcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onConfirmed: () => void;
}

export function ConfirmOutcomeModal({ open, onOpenChange, meetingId, onConfirmed }: ConfirmOutcomeModalProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'sat' | 'no_show' | 'rescheduled' | 'cancelled'>('sat');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!confirmed) {
      toast.error("Please confirm attendance");
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('meetings')
      .update({
        attendance_status: status,
        // Sat-only: isMeetingSat treats this flag as "prospect attended" —
        // matches UpdateMeetingStatusModal's semantics.
        attendance_confirmed: status === 'sat',
      })
      .eq('id', meetingId);

    setLoading(false);

    if (error) {
      toast.error("Failed to confirm outcome");
      console.error(error);
      return;
    }

    // Attendance confirmation moves the SAT count instantly — refresh both
    // RAG surfaces rather than waiting for the 5-min global tick.
    queryClient.invalidateQueries({ queryKey: ["own-setter-rag"] });
    queryClient.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
    toast.success("Meeting outcome confirmed");
    setStatus('sat');
    setConfirmed(false);
    onConfirmed();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Confirm Meeting Outcome</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="status">Meeting Status</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sat">Sat (Attended)</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="confirmed"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked as boolean)}
            />
            <Label htmlFor="confirmed" className="text-sm font-normal cursor-pointer">
              I confirm this outcome is correct
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Confirming..." : "Confirm Outcome"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
