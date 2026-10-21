import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PoundSterling, Save, Loader2, Info } from "lucide-react";

interface ClientFinancialDetailsTabProps {
  clientId: string;
  onUpdate?: () => void;
}

export const ClientFinancialDetailsTab = ({ clientId, onUpdate }: ClientFinancialDetailsTabProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contractValue, setContractValue] = useState(0);
  const [potentialPlacementFeeValue, setPotentialPlacementFeeValue] = useState(0);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("contract_value, potential_placement_fee_value")
        .eq("id", clientId)
        .single();

      if (error) throw error;
      setContractValue((data as any)?.contract_value || 0);
      setPotentialPlacementFeeValue((data as any)?.potential_placement_fee_value || 0);
    } catch (error) {
      console.error("Failed to load financial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({
          contract_value: contractValue,
          potential_placement_fee_value: potentialPlacementFeeValue,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", clientId);

      if (error) throw error;
      toast.success("Financial details saved");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Financial Details</h2>
          <p className="text-sm text-muted-foreground">Contract value and placement fee for ROI calculation.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>These values are visible to the client on their dashboard.</span>
      </div>

      <Card className="border-border shadow-card">
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Contract Value (Investment)</Label>
              <p className="text-sm text-muted-foreground">The client's retainer / contract amount</p>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={contractValue}
                  onChange={(e) => setContractValue(parseFloat(e.target.value) || 0)}
                  className="pl-7"
                />
              </div>
              {contractValue > 0 && <p className="text-sm font-medium text-primary">{formatCurrency(contractValue)}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-base font-medium">Placement Fee Value</Label>
              <p className="text-sm text-muted-foreground">Actual placement fees from vacancies</p>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={potentialPlacementFeeValue}
                  onChange={(e) => setPotentialPlacementFeeValue(parseFloat(e.target.value) || 0)}
                  className="pl-7"
                />
              </div>
              {potentialPlacementFeeValue > 0 && <p className="text-sm font-medium text-emerald-500">{formatCurrency(potentialPlacementFeeValue)}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
