// Partner portal → Your details (18 Sep 2026, Marcus): name on the account,
// sort code, account number, so finder's fees can be paid. Editable any time.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PartnerDetails = () => {
  const qc = useQueryClient();
  const { partner } = usePartnerProfile();
  const [name, setName] = useState(""); const [sort, setSort] = useState(""); const [acct, setAcct] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (partner) { setName(partner.bank_account_name ?? ""); setSort(partner.bank_sort_code ?? ""); setAcct(partner.bank_account_number ?? ""); } }, [partner]);

  const fmtSort = (v: string) => v.replace(/\D/g, "").slice(0, 6).replace(/(\d{2})(?=\d)/g, "$1-");
  const valid = name.trim().length > 1 && sort.replace(/\D/g, "").length === 6 && /^\d{8}$/.test(acct);

  const save = async () => {
    if (!partner || !valid) return;
    setSaving(true);
    const { error } = await supabase.from("partners").update({ bank_account_name: name.trim(), bank_sort_code: fmtSort(sort), bank_account_number: acct, bank_details_updated_at: new Date().toISOString() } as never).eq("id", partner.id);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Details saved"); qc.invalidateQueries({ queryKey: ["partner-profile"] }); }
  };

  return (
    <DashboardLayout role="partner">
      <PageContainer>
        <PageHeader title="Your details" subtitle="Where we pay your finder's fees. UK bank account." />
        <Card className="border-border shadow-card max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /> Bank details</CardTitle>
            <CardDescription>{partner?.bank_details_updated_at ? `Last updated ${format(new Date(partner.bank_details_updated_at), "d MMM yyyy")}` : "Not added yet — we can't pay a fee without these."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1"><Label>Name on the account</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As it appears at your bank" autoComplete="name" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label>Sort code</Label><Input value={sort} onChange={(e) => setSort(fmtSort(e.target.value))} placeholder="12-34-56" inputMode="numeric" /></div>
              <div className="space-y-1"><Label>Account number</Label><Input value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="12345678" inputMode="numeric" /></div>
            </div>
            <Button onClick={save} disabled={!valid || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save details</Button>
          </CardContent>
        </Card>
      </PageContainer>
    </DashboardLayout>
  );
};
export default PartnerDetails;
