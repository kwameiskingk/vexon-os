import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PrefillData {
  client_name?: string;
  client_email?: string;
  company_name?: string | null;
  contract_value?: number | null;
  contract_term?: string | null;
  discovery_log_id?: string | null;
}

interface CreatePitchCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  prefillData?: PrefillData;
}

export function CreatePitchCallModal({
  open,
  onOpenChange,
  onSuccess,
  prefillData,
}: CreatePitchCallModalProps) {
  const [formData, setFormData] = useState({
    client_name: prefillData?.client_name || "",
    client_email: prefillData?.client_email || "",
    company_name: prefillData?.company_name || "",
    contract_value: prefillData?.contract_value?.toString() || "",
    contract_term: prefillData?.contract_term || "",
    notes: "",
    original_interest: "interested",
  });
  const [pitchDate, setPitchDate] = useState<Date | undefined>(undefined);
  const [pitchTime, setPitchTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_email || !pitchDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('pitch_calls').insert({
        client_name: formData.client_name,
        client_email: formData.client_email,
        company_name: formData.company_name || formData.client_name,
        pitch_call_date: format(pitchDate, 'yyyy-MM-dd'),
        pitch_call_time: pitchTime,
        original_interest: formData.original_interest,
        contract_value: formData.contract_value ? parseFloat(formData.contract_value) : null,
        contract_term: formData.contract_term || null,
        notes: formData.notes || null,
        status: 'scheduled',
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Follow-up call created successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setFormData({
        client_name: "",
        client_email: "",
        company_name: "",
        contract_value: "",
        contract_term: "",
        notes: "",
        original_interest: "interested",
      });
      setPitchDate(undefined);
      setPitchTime("09:00");
    } catch (error: any) {
      console.error("Error creating pitch call:", error);
      toast.error(error.message || "Failed to create pitch call");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Follow-Up Call</DialogTitle>
          <DialogDescription>
            Manually create a new follow-up call for a prospect
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client Name */}
          <div className="space-y-2">
            <Label>Client / Company Name *</Label>
            <Input
              value={formData.client_name}
              onChange={(e) => setFormData(prev => ({ ...prev, client_name: e.target.value }))}
              placeholder="Enter client or company name"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={formData.client_email}
              onChange={(e) => setFormData(prev => ({ ...prev, client_email: e.target.value }))}
              placeholder="Enter email address"
            />
          </div>

          {/* Company Name (optional) */}
          <div className="space-y-2">
            <Label>Company Name (if different)</Label>
            <Input
              value={formData.company_name}
              onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
              placeholder="Enter company name"
            />
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

          {/* Interest Level */}
          <div className="space-y-2">
            <Label>Interest Level</Label>
            <Select
              value={formData.original_interest}
              onValueChange={(v) => setFormData(prev => ({ ...prev, original_interest: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="unsure">Unsure</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Contract Value */}
          <div className="space-y-2">
            <Label>Contract Value (£)</Label>
            <Input
              type="number"
              value={formData.contract_value}
              onChange={(e) => setFormData(prev => ({ ...prev, contract_value: e.target.value }))}
              placeholder="e.g. 3000"
            />
          </div>

          {/* Contract Term */}
          <div className="space-y-2">
            <Label>Contract Term</Label>
            <Select
              value={formData.contract_term}
              onValueChange={(v) => setFormData(prev => ({ ...prev, contract_term: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3 months">3 months</SelectItem>
                <SelectItem value="6 months">6 months</SelectItem>
                <SelectItem value="12 months">12 months</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!formData.client_name || !formData.client_email || !pitchDate || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Follow-Up Call"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
