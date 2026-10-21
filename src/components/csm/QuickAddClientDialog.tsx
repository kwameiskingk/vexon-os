import { useEffect, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import type { ClientHealthSnapshotRow } from "@/lib/clientHealthSnapshot";

interface Props {
  row: ClientHealthSnapshotRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (clientId: string) => void;
}

export const QuickAddClientDialog = ({ row, open, onOpenChange, onCreated }: Props) => {
  const [companyName, setCompanyName] = useState("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (open && row) {
      setCompanyName(row.clientName ?? "");
      setEndDate(row.campaignEndDate ?? "");
    }
  }, [open, row]);

  const handleCreate = async () => {
    const name = companyName.trim();
    if (!name) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        company_name: name,
        status: "active",
      };
      if (endDate) payload.campaign_end_date = endDate;

      const { data, error } = await supabase
        .from("client_profiles")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;

      toast({
        title: "Client added",
        description: `${name} is now linked to the sheet row.`,
      });
      await qc.invalidateQueries({ queryKey: ["client-health-snapshot"] });
      onCreated?.((data as any).id);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Couldn't add client",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Quick Add Client
          </DialogTitle>
          <DialogDescription className="text-xs">
            This sheet row has no matching client in the app. Add them now so health, campaigns,
            setters and goals can flow normally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qa-company">Company name</Label>
            <Input
              id="qa-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Must match the sheet's client name (case-insensitive) to auto-link.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-end">Campaign end date</Label>
            <Input
              id="qa-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {row && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11.5px] text-muted-foreground space-y-0.5">
              <div className="font-medium text-foreground/80">Sheet preview</div>
              <div>Booked: {row.meetingsBooked ?? "—"} · Sat: {row.meetingsSat ?? "—"}</div>
              <div>
                Days remaining: {row.daysRemaining ?? "—"} · Revenue:{" "}
                {row.revenueGenerated !== null ? `$${row.revenueGenerated.toLocaleString()}` : "—"}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Add client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
