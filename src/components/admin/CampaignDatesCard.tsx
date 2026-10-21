import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Save, Loader2 } from "lucide-react";

interface CampaignDatesCardProps {
  clientId: string;
  onUpdate?: () => void;
}

export const CampaignDatesCard = ({ clientId, onUpdate }: CampaignDatesCardProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [termsSignedDate, setTermsSignedDate] = useState("");
  const [campaignStartDate, setCampaignStartDate] = useState("");

  useEffect(() => {
    loadDates();
  }, [clientId]);

  const loadDates = async () => {
    try {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("terms_signed_date, campaign_start_date")
        .eq("id", clientId)
        .single();

      if (error) throw error;
      setTermsSignedDate((data as any)?.terms_signed_date || "");
      setCampaignStartDate((data as any)?.campaign_start_date || "");
    } catch (error) {
      console.error("Failed to load campaign dates:", error);
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
          terms_signed_date: termsSignedDate || null,
          campaign_start_date: campaignStartDate || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", clientId);

      if (error) throw error;
      toast.success("Campaign dates saved");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save dates");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Key Campaign Dates
            </CardTitle>
            <CardDescription>
              These dates appear as markers on the client's progress timeline
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="terms-signed-date">Agreement Signed Date</Label>
            <Input
              id="terms-signed-date"
              type="date"
              value={termsSignedDate}
              onChange={(e) => setTermsSignedDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Date when the client signed the agreement</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-start-date">Campaign Start Date</Label>
            <Input
              id="campaign-start-date"
              type="date"
              value={campaignStartDate}
              onChange={(e) => setCampaignStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Date when the campaign officially began</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
