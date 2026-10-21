import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, PoundSterling, Users, Percent } from "lucide-react";

interface MeetingOutcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onSuccess: () => void;
}

export function MeetingOutcomeModal({ open, onOpenChange, meeting, onSuccess }: MeetingOutcomeModalProps) {
  const [outcome, setOutcome] = useState<string>(meeting?.client_outcome || "");
  const [vacancies, setVacancies] = useState<string>(meeting?.vacancies_won?.toString() || "");
  const [value, setValue] = useState<string>(meeting?.vacancies_value?.toString() || "");
  const [feePercentage, setFeePercentage] = useState<string>(meeting?.placement_fee_percentage?.toString() || "");
  const [notes, setNotes] = useState<string>(meeting?.outcome_notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!outcome) {
      toast.error("Please select an outcome");
      return;
    }

    if (outcome === "won" && (!vacancies || !value)) {
      toast.error("Please enter the number of vacancies and their value");
      return;
    }

    setIsSubmitting(true);

    const updateData: any = {
      client_outcome: outcome,
      outcome_notes: notes || null,
      outcome_confirmed_at: new Date().toISOString(),
    };

    if (outcome === "won") {
      updateData.vacancies_won = parseInt(vacancies) || 0;
      updateData.vacancies_value = parseFloat(value) || 0;
      updateData.placement_fee_percentage = parseFloat(feePercentage) || 0;
    } else {
      updateData.vacancies_won = 0;
      updateData.vacancies_value = 0;
    }

    const { error } = await supabase
      .from("meetings")
      .update(updateData)
      .eq("id", meeting.id);

    setIsSubmitting(false);

    if (error) {
      toast.error("Failed to update meeting outcome");
      console.error(error);
      return;
    }

    toast.success("Meeting outcome updated successfully");
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Meeting Outcome</DialogTitle>
          <DialogDescription>
            Record the outcome of your meeting with {meeting?.company_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">What was the outcome?</Label>
            <RadioGroup value={outcome} onValueChange={setOutcome} className="space-y-2">
              <div 
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  outcome === "won" 
                    ? "border-green-500 bg-green-500/10" 
                    : "border-border hover:border-muted-foreground/50"
                }`}
                onClick={() => setOutcome("won")}
              >
                <RadioGroupItem value="won" id="won" />
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <Label htmlFor="won" className="font-medium cursor-pointer">Won</Label>
                  <p className="text-xs text-muted-foreground">Placement secured / vacancies filled</p>
                </div>
              </div>
              
              <div 
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  outcome === "lost" 
                    ? "border-red-500 bg-red-500/10" 
                    : "border-border hover:border-muted-foreground/50"
                }`}
                onClick={() => setOutcome("lost")}
              >
                <RadioGroupItem value="lost" id="lost" />
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <Label htmlFor="lost" className="font-medium cursor-pointer">Lost</Label>
                  <p className="text-xs text-muted-foreground">No placement / did not proceed</p>
                </div>
              </div>
              
              <div 
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  outcome === "pending" 
                    ? "border-amber-500 bg-amber-500/10" 
                    : "border-border hover:border-muted-foreground/50"
                }`}
                onClick={() => setOutcome("pending")}
              >
                <RadioGroupItem value="pending" id="pending" />
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <Label htmlFor="pending" className="font-medium cursor-pointer">In Progress</Label>
                  <p className="text-xs text-muted-foreground">Still in discussions / awaiting decision</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {outcome === "won" && (
            <div className="space-y-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="space-y-2">
                <Label htmlFor="vacancies" className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Number of Vacancies Filled
                </Label>
                <Input
                  id="vacancies"
                  type="number"
                  min="1"
                  placeholder="e.g. 2"
                  value={vacancies}
                  onChange={(e) => setVacancies(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feePercentage" className="text-sm font-medium flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Placement Fee Percentage
                </Label>
                <Input
                  id="feePercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="e.g. 20"
                  value={feePercentage}
                  onChange={(e) => setFeePercentage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">The agreed fee percentage for placements</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="value" className="text-sm font-medium flex items-center gap-2">
                  <PoundSterling className="h-4 w-4" />
                  Total Placement Value (£)
                </Label>
                <Input
                  id="value"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="e.g. 15000"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Total fees earned from this placement</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about this meeting..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Confirm Outcome"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
