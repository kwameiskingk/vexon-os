import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateCampaignModalProps {
  clientId: string;
  onSuccess: () => void;
}

export const CreateCampaignModal = ({
  clientId,
  onSuccess,
}: CreateCampaignModalProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationOption, setDurationOption] = useState<string>("");
  const [customMonths, setCustomMonths] = useState<number>(1);

  const endDate = useMemo(() => {
    if (!startDate || !durationOption) return "";
    const start = new Date(startDate);
    const months = durationOption === "custom" ? customMonths : parseInt(durationOption);
    if (!months || months < 1) return "";
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    return end.toISOString().split("T")[0];
  }, [startDate, durationOption, customMonths]);

  const totalWeeks = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diffMs / (7 * 86400000)));
  }, [startDate, endDate]);

  const [weeklyTargets, setWeeklyTargets] = useState<number[]>([]);

  // Recalculate defaults when totalWeeks changes
  useMemo(() => {
    if (totalWeeks <= 0) {
      setWeeklyTargets([]);
      return;
    }
    const targets = Array.from({ length: totalWeeks }, (_, i) =>
      i < 8 ? 1 : 2
    );
    setWeeklyTargets(targets);
  }, [totalWeeks]);

  const updateWeekTarget = (index: number, value: number) => {
    setWeeklyTargets((prev) => {
      const next = [...prev];
      next[index] = Math.max(0, value);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    try {
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          client_id: clientId,
          name,
          start_date: startDate || null,
          launch_date: startDate || null,
          end_date: endDate || null,
          meetings_booked: 0,
          meetings_sat: 0,
          progress_manual_pct: 0,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Update auto-generated weekly goals with user-specified targets
      if (campaign && startDate && endDate && weeklyTargets.length) {
        const { data: goals } = await supabase
          .from("campaign_weekly_goals")
          .select("id, week_number")
          .eq("campaign_id", campaign.id)
          .order("week_number");

        if (goals?.length) {
          const updates = goals.map((goal) =>
            supabase
              .from("campaign_weekly_goals")
              .update({
                target: weeklyTargets[goal.week_number - 1] ?? 1,
              })
              .eq("id", goal.id)
          );
          await Promise.all(updates);
        }
      }

      toast.success("Campaign created successfully");
      setOpen(false);
      setName("");
      setStartDate("");
      setDurationOption("");
      setCustomMonths(1);
      setWeeklyTargets([]);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create New Campaign</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-auto">
          <div className="space-y-4 pb-2 pr-4">
            {/* Campaign Name */}
            <div className="space-y-2">
              <Label htmlFor="campaign_name">Campaign Name</Label>
              <Input
                id="campaign_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 2025 Campaign"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                className="[color-scheme:dark]"
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Duration / End Date */}
            <div className="space-y-2">
              <Label>Campaign Duration</Label>
              <Select value={durationOption} onValueChange={setDurationOption}>
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="9">9 Months</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>

              {durationOption === "custom" && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min={1}
                    value={customMonths}
                    onChange={(e) => setCustomMonths(parseInt(e.target.value) || 1)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">months</span>
                </div>
              )}

              {endDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  End date: {new Date(endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>

            {/* Per-Week Targets */}
            {totalWeeks > 0 && weeklyTargets.length > 0 && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">
                    Weekly Qualified Lead Targets
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Set the weekly target for qualified leads per week.
                          Default is 1 for weeks 1–8 and 2 thereafter. You can
                          edit each week individually.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalWeeks} weeks total
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {weeklyTargets.map((target, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Wk {i + 1}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={target}
                        onChange={(e) =>
                          updateWeekTarget(i, parseInt(e.target.value) || 0)
                        }
                        className="h-8 text-sm px-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSubmit} className="w-full">
              Create Campaign
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
