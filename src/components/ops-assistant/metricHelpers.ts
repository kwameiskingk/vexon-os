import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type ManualMetric = Database["public"]["Tables"]["manual_daily_metrics"]["Row"];
type MetricInsert = Database["public"]["Tables"]["manual_daily_metrics"]["Insert"];

export interface MetricSaveParams {
  date: string;
  targetUserId: string;
  targetRole: "setter" | "account_executive" | "sdr_manager" | "ops";
  department: "acquisition" | "fulfilment";
  enteredBy: string;
  fields: Partial<MetricInsert>;
  existingMetrics: ManualMetric[];
  userName: string;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
  onSaved: () => void;
}

export async function saveMetric(params: MetricSaveParams) {
  const { date, targetUserId, targetRole, department, enteredBy, fields, existingMetrics, userName, onDuplicate, onSaved } = params;

  const existing = existingMetrics.find(
    (m) => m.target_user_id === targetUserId && m.target_role === targetRole && m.date === date
  );

  const doSave = async () => {
    if (existing) {
      const { error } = await supabase
        .from("manual_daily_metrics")
        .update({ ...fields, entered_by: enteredBy })
        .eq("id", existing.id);
      if (error) {
        toast.error("Failed to update metrics");
        console.error(error);
        return;
      }
      toast.success(`Updated metrics for ${userName}`);
    } else {
      const { error } = await supabase.from("manual_daily_metrics").insert({
        date,
        target_user_id: targetUserId,
        target_role: targetRole,
        department,
        entered_by: enteredBy,
        ...fields,
      } as MetricInsert);
      if (error) {
        toast.error("Failed to save metrics");
        console.error(error);
        return;
      }
      toast.success(`Saved metrics for ${userName}`);
    }
    onSaved();
  };

  if (existing) {
    onDuplicate({
      open: true,
      userName,
      date: format(new Date(date), "EEEE, MMM d"),
      onConfirm: doSave,
    });
  } else {
    await doSave();
  }
}
