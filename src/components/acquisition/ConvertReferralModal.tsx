import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Handshake } from "lucide-react";

export interface ConvertibleReferral {
  id: string;
  contact_full_name: string;
  contact_mobile: string | null;
  contact_email: string | null;
  referred_company_name: string;
  date_referred: string;
  partnerName: string;
}

interface ConvertReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: ConvertibleReferral | null;
  onConverted: () => void;
}

/**
 * AE action: convert a partner referral into a real discovery — creates a
 * normal acquisition meeting (the LogDiscoveryModal insert shape) prefilled
 * from the referral and carrying source_referral_id, then marks the
 * referral converted. From here the discovery flows the standard lifecycle;
 * no parallel record.
 */
export function ConvertReferralModal({ open, onOpenChange, referral, onConverted }: ConvertReferralModalProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (referral) {
      setEmail(referral.contact_email || "");
      setPhone(referral.contact_mobile || "");
      setMeetingDate(format(new Date(), "yyyy-MM-dd"));
      setMeetingTime("10:00");
    }
  }, [referral]);

  const canSave = !!referral && email.trim() && meetingDate && meetingTime;

  const handleConvert = async () => {
    if (!user || !referral || !canSave) return;
    setSaving(true);
    try {
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .insert({
          company_name: referral.referred_company_name,
          prospect_name: referral.contact_full_name,
          prospect_email: email.trim(),
          prospect_mobile: phone.trim() || null,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          department: "acquisition",
          status: "pending",
          is_rebook: false,
          lead_type: "video_conference",
          assigned_ae_id: user.id,
          is_pipeline_reengagement: false,
          source_referral_id: referral.id,
        })
        .select("id")
        .single();
      if (meetingError) throw meetingError;

      const { error: referralError } = await supabase
        .from("referrals")
        .update({
          status: "converted",
          discovery_id: meeting.id,
          converted_by: user.id,
          converted_at: new Date().toISOString(),
        })
        .eq("id", referral.id);
      if (referralError) {
        // Roll the orphaned meeting back so a retry doesn't duplicate it
        await supabase.from("meetings").delete().eq("id", meeting.id);
        throw referralError;
      }

      toast.success("Referral converted to discovery");
      onOpenChange(false);
      onConverted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert referral");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            Convert to Discovery
          </DialogTitle>
        </DialogHeader>
        {referral && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-border/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{referral.referred_company_name}</p>
                <Badge variant="outline" className="shrink-0">
                  Partner Referral · {referral.partnerName}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {referral.contact_full_name} · referred {format(new Date(referral.date_referred), "dd MMM yyyy")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact email *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact phone</Label>
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
            <p className="text-xs text-muted-foreground">
              Creates a normal discovery assigned to you — fill in the rest (recording link,
              contract value, etc.) exactly as any other discovery.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConvert} disabled={!canSave || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Convert to Discovery
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
