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

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  managers: Profile[];
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
}

const sdrFieldDefs = [
  { key: "training_sessions_booked", label: "Training Sessions Booked" },
  { key: "team_dials", label: "Total Team Dials" },
  { key: "team_talk_time", label: "Total Team Talk Time (min)" },
  { key: "team_conversations", label: "Conversations (team)" },
  { key: "team_warm_leads", label: "Warm Leads (team)" },
  { key: "team_meetings_booked", label: "New Meetings Booked (team)" },
] as const;

export const SDRManagerTab = ({ managers, date, existingMetrics, currentUserId, onSaved, onDuplicate }: Props) => {
  return (
    <div className="space-y-4">
      {managers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No SDR managers found.</p>}
      {managers.map((mgr) => (
        <SDRCard key={mgr.id} manager={mgr} date={date} existingMetrics={existingMetrics} currentUserId={currentUserId} onSaved={onSaved} onDuplicate={onDuplicate} />
      ))}
    </div>
  );
};

function SDRCard({ manager, date, existingMetrics, currentUserId, onSaved, onDuplicate }: {
  manager: Profile; date: string; existingMetrics: ManualMetric[]; currentUserId: string; onSaved: () => void;
  onDuplicate: Props["onDuplicate"];
}) {
  const existing = existingMetrics.find((m) => m.target_user_id === manager.id && m.target_role === "sdr_manager");
  const isComplete = !!existing;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      const init: Record<string, string> = {};
      sdrFieldDefs.forEach((f) => {
        const val = (existing as any)[f.key];
        init[f.key] = val != null ? val.toString() : "";
      });
      setFields(init);
    }
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, any> = {};
    sdrFieldDefs.forEach((f) => {
      payload[f.key] = fields[f.key] ? parseInt(fields[f.key]) : null;
    });
    await saveMetric({
      date, targetUserId: manager.id, targetRole: "sdr_manager", department: "fulfilment",
      enteredBy: currentUserId, fields: payload, existingMetrics,
      userName: manager.full_name || manager.email || "Unknown", onDuplicate, onSaved,
    });
    setSaving(false);
  };

  return (
    <Card className={isComplete ? "border-green-500/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{manager.full_name || manager.email}</span>
            {isComplete && (
              <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {sdrFieldDefs.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input type="number" min="0" value={fields[f.key] || ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
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
