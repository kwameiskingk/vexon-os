import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { saveMetric } from "./metricHelpers";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ManualMetric = Database["public"]["Tables"]["manual_daily_metrics"]["Row"];

interface SetterProfile {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
}

interface Props {
  setters: SetterProfile[];
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
}

interface SetterFields {
  dials: string;
  talk_time_minutes: string;
  conversations: string;
  warm_leads: string;
  meetings_booked_input: string;
}

export const AcquisitionSettersTab = ({ setters, date, existingMetrics, currentUserId, onSaved, onDuplicate }: Props) => {
  return (
    <div className="space-y-4">
      {setters.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No acquisition setters found.</p>
      )}
      {setters.map((setter) => (
        <SetterCard
          key={setter.id}
          setter={setter}
          date={date}
          existingMetrics={existingMetrics}
          currentUserId={currentUserId}
          onSaved={onSaved}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
};

function SetterCard({ setter, date, existingMetrics, currentUserId, onSaved, onDuplicate }: {
  setter: SetterProfile;
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: Props["onDuplicate"];
}) {
  const existing = existingMetrics.find(
    (m) => m.target_user_id === setter.user_id && m.target_role === "setter"
  );
  const isComplete = !!existing;

  const [fields, setFields] = useState<SetterFields>({
    dials: "",
    talk_time_minutes: "",
    conversations: "",
    warm_leads: "",
    meetings_booked_input: "",
  });
  const [discrepancyAck, setDiscrepancyAck] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-fill if existing
  useEffect(() => {
    if (existing) {
      setFields({
        dials: existing.dials?.toString() || "",
        talk_time_minutes: existing.talk_time_minutes?.toString() || "",
        conversations: existing.conversations?.toString() || "",
        warm_leads: existing.warm_leads?.toString() || "",
        meetings_booked_input: existing.meetings_booked_input?.toString() || "",
      });
    }
  }, [existing]);

  // Fetch app-logged meetings for this setter on this date
  const { data: appMeetings = 0 } = useQuery({
    queryKey: ["app-meetings", setter.user_id, date],
    queryFn: async () => {
      if (!setter.user_id) return 0;
      const { count } = await supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .or(`setter_id.eq.${setter.user_id},logged_by_setter_id.eq.${setter.user_id}`)
        .gte("created_at", `${date}T00:00:00`)
        .lt("created_at", `${date}T23:59:59`)
        .eq("is_rebook", false);
      return count || 0;
    },
    enabled: !!setter.user_id,
  });

  const inputMeetings = parseInt(fields.meetings_booked_input) || 0;
  const mismatchType = inputMeetings > appMeetings ? "input_higher" : inputMeetings < appMeetings ? "app_higher" : "none";
  const hasRedMismatch = mismatchType === "app_higher" && fields.meetings_booked_input !== "";

  const handleSave = async () => {
    if (hasRedMismatch && !discrepancyAck) {
      toast.error("Please acknowledge the discrepancy before submitting");
      return;
    }
    setSaving(true);
    await saveMetric({
      date,
      targetUserId: setter.user_id!,
      targetRole: "setter",
      department: "acquisition",
      enteredBy: currentUserId,
      fields: {
        dials: parseInt(fields.dials) || null,
        talk_time_minutes: parseInt(fields.talk_time_minutes) || null,
        conversations: parseInt(fields.conversations) || null,
        warm_leads: parseInt(fields.warm_leads) || null,
        meetings_booked_input: inputMeetings || null,
        meetings_booked_app: appMeetings,
        mismatch_flag: mismatchType as any,
        mismatch_notified: false,
      },
      existingMetrics,
      userName: setter.full_name || setter.email || "Unknown",
      onDuplicate,
      onSaved,
    });
    setSaving(false);
  };

  const handleNotify = async () => {
    toast.success(`Notification sent to ${setter.full_name || setter.email} about outstanding meeting logs`);
  };

  return (
    <Card className={isComplete ? "border-green-500/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{setter.full_name || setter.email}</span>
            {isComplete && (
              <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <Label className="text-xs text-muted-foreground">Dials</Label>
            <Input type="number" min="0" value={fields.dials} onChange={(e) => setFields({ ...fields, dials: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Talk Time (min)</Label>
            <Input type="number" min="0" value={fields.talk_time_minutes} onChange={(e) => setFields({ ...fields, talk_time_minutes: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Conversations</Label>
            <Input type="number" min="0" value={fields.conversations} onChange={(e) => setFields({ ...fields, conversations: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Warm Leads</Label>
            <Input type="number" min="0" value={fields.warm_leads} onChange={(e) => setFields({ ...fields, warm_leads: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-xs text-muted-foreground">New Meetings Booked</Label>
            <Input
              type="number"
              min="0"
              value={fields.meetings_booked_input}
              onChange={(e) => { setFields({ ...fields, meetings_booked_input: e.target.value }); setDiscrepancyAck(false); }}
              className={mismatchType === "input_higher" ? "border-amber-500" : mismatchType === "app_higher" ? "border-red-500" : fields.meetings_booked_input && mismatchType === "none" ? "border-green-500" : ""}
            />
          </div>
        </div>

        {/* App-logged reference */}
        <div className="text-xs text-muted-foreground mb-2">
          App-logged: <strong>{appMeetings}</strong> meetings
          {fields.meetings_booked_input !== "" && mismatchType === "none" && (
            <CheckCircle className="inline h-3.5 w-3.5 text-green-500 ml-1.5" />
          )}
        </div>

        {/* Mismatch messages */}
        {mismatchType === "input_higher" && fields.meetings_booked_input !== "" && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p>Input is higher than app-logged meetings. Notify setter of outstanding logs?</p>
              <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={handleNotify}>
                Notify
              </Button>
            </div>
          </div>
        )}

        {mismatchType === "app_higher" && fields.meetings_booked_input !== "" && (
          <div className="space-y-2 mb-3">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs">App shows more meetings than input. Please cross-reference before submitting.</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`ack-${setter.id}`}
                checked={discrepancyAck}
                onCheckedChange={(c) => setDiscrepancyAck(!!c)}
              />
              <label htmlFor={`ack-${setter.id}`} className="text-xs text-muted-foreground cursor-pointer">
                I have reviewed this discrepancy and am submitting anyway
              </label>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saving || (hasRedMismatch && !discrepancyAck)}
        >
          {saving ? "Saving..." : isComplete ? "Update" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
