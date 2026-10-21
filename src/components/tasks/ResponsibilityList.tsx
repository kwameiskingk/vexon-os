import { TaskInstance } from "@/hooks/useTaskInstances";
import { Button } from "@/components/ui/button";
import { Check, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  items: TaskInstance[];
  loading?: boolean;
}

export const ResponsibilityList = ({ items, loading }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const handleCheckin = async (instanceId: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from("responsibility_checkins").insert({
      task_instance_id: instanceId,
      user_id: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // Mark instance done for the day
    await supabase
      .from("task_instances")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", instanceId);
    qc.invalidateQueries({ queryKey: ["task-instances", user.id] });
    toast.success("Check-in recorded");
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No standing responsibilities assigned.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((r) => {
        const acked = r.status === "done";
        return (
          <div
            key={r.id}
            className={cn(
              "rounded-xl border bg-card/60 p-3 transition-all duration-200",
              acked ? "border-success/30 bg-success/5" : "hover:bg-card hover:border-border/60"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  acked ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                )}
              >
                <Repeat className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.title}</div>
                {r.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                )}
              </div>
              <Button
                variant={acked ? "outline" : "secondary"}
                size="sm"
                onClick={() => handleCheckin(r.id)}
                disabled={acked}
                className="h-8"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {acked ? "Done today" : "Check in"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
