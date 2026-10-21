import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

interface AddFullClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (clientId: string) => void;
}

/**
 * Adds a fully-fledged ACTIVE client directly to the Clients tab, bypassing
 * the onboarding pipeline. For edge cases only — e.g. a client onboarded
 * outside the normal flow. The normal route for new clients is
 * Onboarding → Add Client (AddClientToOnboardingModal), where they stay
 * 'pending' until onboarding completes.
 */
export function AddFullClientDialog({ open, onOpenChange, onCreated }: AddFullClientDialogProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [contractTerm, setContractTerm] = useState("");

  const resetForm = () => {
    setCompanyName("");
    setContactName("");
    setEmail("");
    setMobile("");
    setWebsite("");
    setIndustry("");
    setCountry("");
    setContractValue("");
    setContractTerm("");
  };

  const handleCreate = async () => {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      // 9 Oct 2026: the PandaDoc webhook creates a `pending` profile for every
      // signed agreement, keyed on the signer's email. When Daniel then adds
      // the same client here by hand we ended up with twins (Atlas Talent /
      // Atlas Talent Limited, Harlow & Finch / Harlow & Finch Recruitment). If a
      // pending profile already has this email, promote THAT row to active
      // with the details typed here instead of inserting a second one.
      const typedEmail = email.trim().toLowerCase();
      if (typedEmail) {
        const { data: twin } = await supabase
          .from("client_profiles")
          .select("id, company_name, status")
          .ilike("email", typedEmail.replace(/[\\%_]/g, (c) => `\\${c}`))
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (twin && twin.status === "active") {
          toast.error(`${twin.company_name} is already an active client with that email.`);
          setSaving(false);
          return;
        }
        if (twin && twin.status === "pending") {
          const promote: Record<string, unknown> = {
            company_name: companyName.trim(),
            contact_name: contactName.trim() || null,
            phone: mobile.trim() || null,
            website: website.trim() || null,
            industry: industry.trim() || null,
            country: country.trim() || null,
            status: "active",
          };
          if (contractValue) promote.contract_value = parseFloat(contractValue);
          if (contractTerm) promote.contract_term = contractTerm;
          const { error: promoteError } = await supabase
            .from("client_profiles")
            .update(promote as never)
            .eq("id", twin.id);
          if (promoteError) throw promoteError;
          queryClient.invalidateQueries({ queryKey: ["native-client-health"] });
          toast.success(`${companyName.trim()} was already in onboarding as ${twin.company_name}, so that profile is now active`);
          onCreated?.(twin.id);
          resetForm();
          onOpenChange(false);
          return;
        }
      }

      const insertData: Record<string, any> = {
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: mobile.trim() || null,
        website: website.trim() || null,
        industry: industry.trim() || null,
        country: country.trim() || null,
        status: "active",
      };
      if (contractValue) insertData.contract_value = parseFloat(contractValue);

      const { data, error } = await supabase
        .from("client_profiles")
        .insert(insertData as any)
        .select("id")
        .single();
      if (error) throw error;

      if (contractTerm) {
        const { error: termError } = await supabase
          .from("client_profiles")
          .update({ contract_term: contractTerm })
          .eq("id", data.id);
        if (termError) {
          console.error("contract_term not saved (migration pending?):", termError);
          toast.warning("Client saved, but the contract term could not be stored yet.");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["native-client-health"] });
      toast.success(`${companyName.trim()} added as an active client`);
      onCreated?.(data.id);
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding client:", error);
      toast.error(`Failed to create client: ${error?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Add Client Directly
          </DialogTitle>
          <DialogDescription>
            Creates a fully-fledged active client, skipping the onboarding pipeline.
            For clients onboarded outside the normal flow — new deals should go
            through Onboarding instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fc-company">Company Name *</Label>
            <Input
              id="fc-company"
              placeholder="e.g. Acme Corp"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-contact">Contact Name</Label>
              <Input
                id="fc-contact"
                placeholder="e.g. John Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-mobile">Mobile</Label>
              <Input
                id="fc-mobile"
                type="tel"
                placeholder="e.g. +44 7700 900000"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fc-email">Email</Label>
            <Input
              id="fc-email"
              type="email"
              placeholder="e.g. john@acme.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fc-website">Company Website</Label>
            <Input
              id="fc-website"
              placeholder="e.g. https://acme.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-industry">Industry</Label>
              <Input
                id="fc-industry"
                placeholder="e.g. Tech Recruitment"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-country">Country</Label>
              <Input
                id="fc-country"
                placeholder="e.g. United Kingdom"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-contractValue">Contract Value (£)</Label>
              <Input
                id="fc-contractValue"
                type="number"
                placeholder="e.g. 9000"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-contractTerm">Contract Term</Label>
              <Select value={contractTerm} onValueChange={setContractTerm}>
                <SelectTrigger id="fc-contractTerm">
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !companyName.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Active Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
