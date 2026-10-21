import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { saveMetric } from "./metricHelpers";
import type { Database } from "@/integrations/supabase/types";

type ManualMetric = Database["public"]["Tables"]["manual_daily_metrics"]["Row"];

interface AEProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  aes: AEProfile[];
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
}

const aeFieldDefs = [
  { key: "cash_collected", label: "Cash Collected", type: "decimal" },
  { key: "deals_closed", label: "Deals Closed", type: "int" },
  { key: "discoveries_scheduled", label: "Discoveries Scheduled", type: "int" },
  { key: "discoveries_set", label: "Discoveries Set", type: "int" },
  { key: "disco_show_rate", label: "Disco Show Rate (%)", type: "pct" },
  { key: "closing_calls_booked", label: "Closing Calls Booked", type: "int" },
  { key: "disco_to_closing_pct", label: "Disco → Closing (%)", type: "pct" },
  { key: "closing_calls_scheduled", label: "Closing Calls Scheduled", type: "int" },
  { key: "closing_calls_set", label: "Closing Calls Set", type: "int" },
  { key: "close_rate_pct", label: "Close Rate (%)", type: "pct" },
  { key: "ae_dials", label: "Dials", type: "int" },
  { key: "prospects_reactivated", label: "Prospects Reactivated", type: "int" },
] as const;

export const AccountExecutivesTab = ({ aes, date, existingMetrics, currentUserId, onSaved, onDuplicate }: Props) => {
  return (
    <div className="space-y-4">
      {aes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No account executives found.</p>}
      {aes.map((ae) => (
        <AECard key={ae.id} ae={ae} date={date} existingMetrics={existingMetrics} currentUserId={currentUserId} onSaved={onSaved} onDuplicate={onDuplicate} />
      ))}
    </div>
  );
};

function AECard({ ae, date, existingMetrics, currentUserId, onSaved, onDuplicate }: {
  ae: AEProfile; date: string; existingMetrics: ManualMetric[]; currentUserId: string; onSaved: () => void;
  onDuplicate: Props["onDuplicate"];
}) {
  const existing = existingMetrics.find((m) => m.target_user_id === ae.id && m.target_role === "account_executive");
  const isComplete = !!existing;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      const init: Record<string, string> = {};
      aeFieldDefs.forEach((f) => {
        const val = (existing as any)[f.key];
        init[f.key] = val != null ? val.toString() : "";
      });
      setFields(init);
    }
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, any> = {};
    aeFieldDefs.forEach((f) => {
      const raw = fields[f.key] || "";
      if (f.type === "decimal") payload[f.key] = raw ? parseFloat(raw) : null;
      else if (f.type === "pct") payload[f.key] = raw ? Math.min(100, Math.max(0, parseFloat(raw))) : null;
      else payload[f.key] = raw ? parseInt(raw) : null;
    });
    await saveMetric({
      date, targetUserId: ae.id, targetRole: "account_executive", department: "acquisition",
      enteredBy: currentUserId, fields: payload, existingMetrics,
      userName: ae.full_name || ae.email || "Unknown", onDuplicate, onSaved,
    });
    setSaving(false);
  };

  return (
    <Card className={isComplete ? "border-green-500/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{ae.full_name || ae.email}</span>
            {isComplete && (
              <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {aeFieldDefs.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                type="number"
                min="0"
                max={f.type === "pct" ? "100" : undefined}
                step={f.type === "decimal" ? "0.01" : f.type === "pct" ? "0.1" : "1"}
                value={fields[f.key] || ""}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isComplete ? "Update" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
