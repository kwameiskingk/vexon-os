import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LEAD_STATUSES, getStatusLabel } from "./WarmLeadStatusBadge";

interface Props {
  warmLeadId: string;
  currentStatus: string;
  onUpdated: () => void;
}

export function WarmLeadStatusDropdown({ warmLeadId, currentStatus, onUpdated }: Props) {
  const [showNotes, setShowNotes] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleStatusChange = (newStatus: string) => {
    setPendingStatus(newStatus);
    setNotes("");
    setShowNotes(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update warm_leads status
      const { error: updateError } = await supabase
        .from("warm_leads")
        .update({
          lead_status: pendingStatus,
          last_status_update: new Date().toISOString(),
          status_updated_by: user.id,
        })
        .eq("id", warmLeadId);

      if (updateError) throw updateError;

      // Insert status update log
      const { error: logError } = await supabase
        .from("warm_lead_status_updates")
        .insert({
          warm_lead_id: warmLeadId,
          status: pendingStatus,
          notes: notes || null,
          updated_by: user.id,
        });

      if (logError) throw logError;

      toast.success("Status updated");
      setShowNotes(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select value={currentStatus} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {getStatusLabel(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={showNotes} onOpenChange={setShowNotes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status to "{getStatusLabel(pendingStatus)}"</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Add notes about this status change (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNotes(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Update Status"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
