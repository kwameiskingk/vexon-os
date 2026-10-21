import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  CalendarIcon,
  Loader2,
  Calendar as CalendarIconOutline,
  Phone,
  UserCheck,
  XCircle,
  TrendingUp,
  PoundSterling,
  History,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

interface AEMetricsOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AEProfile {
  id: string;
  full_name: string;
  email: string;
}

interface MetricsOverride {
  id: string;
  ae_user_id: string;
  period_start: string;
  period_end: string;
  total_discovery: number;
  qualified_discovery: number;
  no_shows: number;
  lead_followups: number;
  total_closes: number;
  contract_value: number;
  cash_collected: number;
  notes: string | null;
  created_at: string;
}

export function AEMetricsOverrideModal({ open, onOpenChange }: AEMetricsOverrideModalProps) {
  const queryClient = useQueryClient();
  const today = new Date();
  
  // Form state
  const [selectedAE, setSelectedAE] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(today));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(today));
  const [totalDiscovery, setTotalDiscovery] = useState(0);
  const [qualifiedDiscovery, setQualifiedDiscovery] = useState(0);
  const [noShows, setNoShows] = useState(0);
  const [leadFollowups, setLeadFollowups] = useState(0);
  const [totalCloses, setTotalCloses] = useState(0);
  const [contractValue, setContractValue] = useState(0);
  const [cashCollected, setCashCollected] = useState(0);
  const [notes, setNotes] = useState("");

  // Fetch AE profiles
  const { data: aeProfiles, isLoading: loadingAEs } = useQuery({
    queryKey: ["ae-profiles-for-override"],
    queryFn: async () => {
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      return (profiles || []) as AEProfile[];
    },
    enabled: open,
  });

  // Fetch existing overrides for selected AE
  const { data: existingOverrides, isLoading: loadingOverrides } = useQuery({
    queryKey: ["ae-overrides", selectedAE],
    queryFn: async () => {
      if (!selectedAE) return [];
      
      const { data, error } = await supabase
        .from("ae_metrics_overrides")
        .select("*")
        .eq("ae_user_id", selectedAE)
        .order("period_start", { ascending: false });

      if (error) throw error;
      return data as MetricsOverride[];
    },
    enabled: !!selectedAE && open,
  });

  // Check for existing override in the selected period
  useEffect(() => {
    if (existingOverrides && selectedAE && periodStart && periodEnd) {
      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");
      
      const existing = existingOverrides.find(
        (o) => o.period_start === startStr && o.period_end === endStr
      );

      if (existing) {
        setTotalDiscovery(existing.total_discovery);
        setQualifiedDiscovery(existing.qualified_discovery);
        setNoShows(existing.no_shows);
        setLeadFollowups(existing.lead_followups);
        setTotalCloses(existing.total_closes);
        setContractValue(existing.contract_value);
        setCashCollected(existing.cash_collected);
        setNotes(existing.notes || "");
      } else {
        // Reset form if no existing override
        resetForm();
      }
    }
  }, [existingOverrides, selectedAE, periodStart, periodEnd]);

  const resetForm = () => {
    setTotalDiscovery(0);
    setQualifiedDiscovery(0);
    setNoShows(0);
    setLeadFollowups(0);
    setTotalCloses(0);
    setContractValue(0);
    setCashCollected(0);
    setNotes("");
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAE) throw new Error("Please select an Account Executive");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");

      // Upsert the override
      const { error } = await supabase
        .from("ae_metrics_overrides")
        .upsert({
          ae_user_id: selectedAE,
          period_start: startStr,
          period_end: endStr,
          total_discovery: totalDiscovery,
          qualified_discovery: qualifiedDiscovery,
          no_shows: noShows,
          lead_followups: leadFollowups,
          total_closes: totalCloses,
          contract_value: contractValue,
          cash_collected: cashCollected,
          notes: notes.trim() || null,
          created_by: user.id,
        }, {
          onConflict: "ae_user_id,period_start,period_end",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Metrics override saved successfully");
      queryClient.invalidateQueries({ queryKey: ["ae-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["ae-dashboard-data"] });
    },
    onError: (error: any) => {
      console.error("Error saving override:", error);
      toast.error(error.message || "Failed to save override");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("ae_metrics_overrides")
        .delete()
        .eq("id", overrideId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override deleted");
      queryClient.invalidateQueries({ queryKey: ["ae-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["ae-dashboard-data"] });
      resetForm();
    },
    onError: (error: any) => {
      console.error("Error deleting override:", error);
      toast.error(error.message || "Failed to delete override");
    },
  });

  const getAEName = (aeId: string) => {
    return aeProfiles?.find((p) => p.id === aeId)?.full_name || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIconOutline className="h-5 w-5 text-primary" />
            AE Metrics Override
          </DialogTitle>
          <DialogDescription>
            Manually set AE performance metrics for tracking during transition periods
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[60vh] pr-2">
          <div className="space-y-6 pb-4">
            {/* AE Selection & Period */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Executive</Label>
                {loadingAEs ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedAE} onValueChange={setSelectedAE}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AE..." />
                    </SelectTrigger>
                    <SelectContent>
                      {aeProfiles?.map((ae) => (
                        <SelectItem key={ae.id} value={ae.id}>
                          {ae.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Period</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !periodStart && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodStart ? format(periodStart, "MMM d, yyyy") : "Start date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={periodStart}
                        onSelect={(date) => date && setPeriodStart(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !periodEnd && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodEnd ? format(periodEnd, "MMM d, yyyy") : "End date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={periodEnd}
                        onSelect={(date) => date && setPeriodEnd(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <Separator />

            {/* Discovery Performance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarIconOutline className="h-4 w-4 text-primary" />
                  Discovery Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Total Discovery</Label>
                    <Input
                      type="number"
                      min={0}
                      value={totalDiscovery}
                      onChange={(e) => setTotalDiscovery(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Qualified</Label>
                    <Input
                      type="number"
                      min={0}
                      value={qualifiedDiscovery}
                      onChange={(e) => setQualifiedDiscovery(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">No Shows</Label>
                    <Input
                      type="number"
                      min={0}
                      value={noShows}
                      onChange={(e) => setNoShows(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline & Conversion */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Pipeline & Conversion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Lead Follow-ups</Label>
                    <Input
                      type="number"
                      min={0}
                      value={leadFollowups}
                      onChange={(e) => setLeadFollowups(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Total Closes</Label>
                    <Input
                      type="number"
                      min={0}
                      value={totalCloses}
                      onChange={(e) => setTotalCloses(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PoundSterling className="h-4 w-4 text-primary" />
                  Revenue (GBP)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Contract Value</Label>
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={contractValue}
                      onChange={(e) => setContractValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Cash Collected</Label>
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={cashCollected}
                      onChange={(e) => setCashCollected(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any context about these metrics..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Override History */}
            {selectedAE && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <Label>Override History</Label>
                </div>
                {loadingOverrides ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : existingOverrides && existingOverrides.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {existingOverrides.map((override) => (
                      <div
                        key={override.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {format(new Date(override.period_start), "MMM d")} -{" "}
                            {format(new Date(override.period_end), "MMM d, yyyy")}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {override.total_closes} closes
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              £{override.contract_value.toLocaleString()}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate(override.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No overrides recorded yet
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !selectedAE}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Entry"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
