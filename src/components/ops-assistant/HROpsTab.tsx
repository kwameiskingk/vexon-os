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
  users: Profile[];
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
}

const opsFieldDefs: { key: string; label: string; type?: string }[] = [
  { key: "trial_calls_scheduled", label: "Trial Calls Scheduled" },
  { key: "trial_calls_set", label: "Trial Calls Set" },
  { key: "invited_to_interview", label: "Invited to Interview" },
  { key: "set_to_interview_pct", label: "Set → Interview (%)", type: "pct" },
  { key: "candidate_dials", label: "Dials to Candidates" },
  { key: "candidates_screened", label: "Candidates Screened" },
  { key: "new_trial_calls_booked", label: "New Trial Calls Booked" },
  { key: "sdrs_hired", label: "SDRs Hired" },
];

export const HROpsTab = ({ users, date, existingMetrics, currentUserId, onSaved, onDuplicate }: Props) => {
  return (
    <div className="space-y-4">
      {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No HR/Ops users found.</p>}
      {users.map((u) => (
        <OpsCard key={u.id} user={u} date={date} existingMetrics={existingMetrics} currentUserId={currentUserId} onSaved={onSaved} onDuplicate={onDuplicate} />
      ))}
    </div>
  );
};

function OpsCard({ user, date, existingMetrics, currentUserId, onSaved, onDuplicate }: {
  user: Profile; date: string; existingMetrics: ManualMetric[]; currentUserId: string; onSaved: () => void;
  onDuplicate: Props["onDuplicate"];
}) {
  const existing = existingMetrics.find((m) => m.target_user_id === user.id && m.target_role === "ops");
  const isComplete = !!existing;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      const init: Record<string, string> = {};
      opsFieldDefs.forEach((f) => {
        const val = (existing as any)[f.key];
        init[f.key] = val != null ? val.toString() : "";
      });
      setFields(init);
    }
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, any> = {};
    opsFieldDefs.forEach((f) => {
      const raw = fields[f.key] || "";
      if (f.type === "pct") payload[f.key] = raw ? Math.min(100, Math.max(0, parseFloat(raw))) : null;
      else payload[f.key] = raw ? parseInt(raw) : null;
    });
    await saveMetric({
      date, targetUserId: user.id, targetRole: "ops", department: "acquisition",
      enteredBy: currentUserId, fields: payload, existingMetrics,
      userName: user.full_name || user.email || "Unknown", onDuplicate, onSaved,
    });
    setSaving(false);
  };

  return (
    <Card className={isComplete ? "border-green-500/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.full_name || user.email}</span>
            {isComplete && (
              <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {opsFieldDefs.map((f) => (
            <div key={f.key}>
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                type="number"
                min="0"
                max={f.type === "pct" ? "100" : undefined}
                step={f.type === "pct" ? "0.1" : "1"}
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
