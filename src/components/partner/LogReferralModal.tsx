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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface LogReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  onLogged: () => void;
}

/** Partner-side referral capture. Inserts a referrals row with
 *  status='submitted'; RLS forces payout/conversion fields empty. */
export function LogReferralModal({ open, onOpenChange, partnerId, onLogged }: LogReferralModalProps) {
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [dateReferred, setDateReferred] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setContactName("");
    setContactMobile("");
    setContactEmail("");
    setCompanyName("");
    setDateReferred(format(new Date(), "yyyy-MM-dd"));
  };

  const canSave = contactName.trim() && companyName.trim() && dateReferred;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("referrals").insert({
        partner_id: partnerId,
        contact_full_name: contactName.trim(),
        contact_mobile: contactMobile.trim() || null,
        contact_email: contactEmail.trim() || null,
        referred_company_name: companyName.trim(),
        date_referred: dateReferred,
        status: "submitted",
      });
      if (error) throw error;
      toast.success("Referral submitted — our team will be in touch");
      reset();
      onOpenChange(false);
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit referral");
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
          <DialogTitle>Log a Referral</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
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
              <Label>Contact mobile</Label>
              <Input
                value={contactMobile}
                onChange={(e) => setContactMobile(e.target.value)}
                placeholder="+44 ..."
              />
            </div>
            <div className="space-y-2">
              <Label>Contact email</Label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@company.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Referred company name *</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Recruitment Ltd"
            />
          </div>
          <div className="space-y-2">
            <Label>Date referred *</Label>
            <Input
              type="date"
              value={dateReferred}
              onChange={(e) => setDateReferred(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Referral
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
