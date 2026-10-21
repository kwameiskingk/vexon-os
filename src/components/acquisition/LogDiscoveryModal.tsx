import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface LogDiscoveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}

/**
 * AE-side discovery logging (W2). Creates a normal acquisition meeting
 * assigned to the logging AE that flows the standard discovery lifecycle.
 * Setter attribution fields are intentionally left null — AE-logged
 * discoveries count in CEO booked totals but never appear in setter
 * leaderboards or per-setter goal tracking.
 */
export function LogDiscoveryModal({ open, onOpenChange, onLogged }: LogDiscoveryModalProps) {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [isReengagement, setIsReengagement] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setMeetingDate(format(new Date(), "yyyy-MM-dd"));
    setMeetingTime("10:00");
    setIsReengagement(false);
  };

  const canSave =
    companyName.trim() && contactName.trim() && email.trim() && meetingDate && meetingTime;

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("meetings").insert({
        company_name: companyName.trim(),
        prospect_name: contactName.trim(),
        prospect_email: email.trim(),
        prospect_mobile: phone.trim() || null,
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        department: "acquisition",
        status: "pending",
        is_rebook: false,
        lead_type: "video_conference",
        assigned_ae_id: user.id,
        is_pipeline_reengagement: isReengagement,
      });
      if (error) throw error;
      toast.success(
        isReengagement ? "Pipeline re-engagement discovery logged" : "Discovery logged",
      );
      reset();
      onOpenChange(false);
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log discovery");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log discovery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Company name *</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Recruitment Ltd"
            />
          </div>
          <div className="space-y-2">
            <Label>Contact full name *</Label>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 ..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting date *</Label>
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meeting time *</Label>
              <Input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
            <Checkbox
              id="pipeline-reengagement"
              checked={isReengagement}
              onCheckedChange={(v) => setIsReengagement(v === true)}
            />
            <div>
              <Label htmlFor="pipeline-reengagement" className="text-sm font-normal">
                Was this a pipeline re-engagement meeting?
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tick if this discovery came from re-engaging an old pipeline lead. It will
                light the CEO pipeline re-engagement tile; either way it logs as a normal
                discovery assigned to you.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log discovery
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
