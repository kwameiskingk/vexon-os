import { TaskInstance } from "@/hooks/useTaskInstances";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock, CheckCircle2, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { getTaskUiState, formatSlotRange, type TaskUiStatus } from "@/utils/taskStatus";
import { useUserTimezone } from "@/utils/timezoneUtils";

interface Props {
  tasks: TaskInstance[];
  onToggle: (id: string, status: "open" | "done") => void;
  loading?: boolean;
}

const STATUS_LABEL: Record<TaskUiStatus, string> = {
  done: "Done",
  available: "Open now",
  overdue: "Overdue",
  missed: "Missed",
  pending: "Upcoming",
};

const LINK_ROUTE: Record<string, string> = {
  form_sod: "/forms",
  form_eod: "/forms",
  meeting_log: "/setter/meetings",
};

const routeForTask = (t: TaskInstance) => {
  if (!t.link_type) return null;
  if (t.link_type.startsWith("form_hourly_")) return "/forms";
  return LINK_ROUTE[t.link_type] || null;
};

export const TaskList = ({ tasks, onToggle, loading }: Props) => {
  const tz = useUserTimezone();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No tasks for today. Enjoy the breather. 🌿
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tasks.map((t) => {
        const ui = getTaskUiState(t, tz);
        const route = routeForTask(t);
        const slotRange = ui.isHourly && t.link_slot != null ? formatSlotRange(t.link_slot) : null;

        return (
          <div
            key={t.id}
            className={cn(
              "group relative rounded-xl border p-4 transition-all duration-200",
              ui.uiStatus === "done" && "bg-card/60 border-success/30",
              ui.uiStatus === "available" && "bg-card border-primary/40 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]",
              ui.uiStatus === "overdue" && "bg-card border-warning/40",
              ui.uiStatus === "missed" && "bg-card/30 border-destructive/25",
              ui.uiStatus === "pending" && "bg-muted/20 border-border/30 opacity-60",
            )}
          >
            <div className="flex items-start gap-4">
              {/* Status indicator */}
              <div className="pt-0.5 shrink-0">
                {ui.uiStatus === "done" && (
                  <div className="size-5 rounded-full border border-success bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  </div>
                )}
                {ui.uiStatus === "available" && ui.canToggle && (
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => onToggle(t.id, "done")}
                    className="size-5 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                )}
                {ui.uiStatus === "available" && !ui.canToggle && (
                  <div className="size-5 rounded-full border-2 border-primary bg-primary/5 flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                )}
                {ui.uiStatus === "overdue" && (
                  ui.canToggle ? (
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => onToggle(t.id, "done")}
                      className="size-5 border-warning data-[state=checked]:bg-warning"
                    />
                  ) : (
                    <div className="size-5 rounded-full border border-warning flex items-center justify-center">
                      <AlertCircle className="h-3 w-3 text-warning" />
                    </div>
                  )
                )}
                {ui.uiStatus === "missed" && (
                  <div className="size-5 rounded border border-destructive/40 bg-destructive/5 flex items-center justify-center">
                    <Lock className="h-2.5 w-2.5 text-destructive" />
                  </div>
                )}
                {ui.uiStatus === "pending" && (
                  <div className="size-5 rounded border border-border/60 bg-muted/30 flex items-center justify-center">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {(slotRange || t.due_at) && (
                  <div
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wider mb-0.5",
                      ui.uiStatus === "available" && "text-primary font-bold",
                      ui.uiStatus === "overdue" && "text-warning font-semibold",
                      ui.uiStatus === "missed" && "text-destructive/60",
                      ui.uiStatus === "done" && "text-muted-foreground",
                      ui.uiStatus === "pending" && "text-muted-foreground/60",
                    )}
                  >
                    {slotRange || (t.due_at ? format(new Date(t.due_at), "h:mm a") : null)}
                  </div>
                )}
                <div
                  className={cn(
                    "text-sm font-medium",
                    ui.uiStatus === "done" && "line-through text-muted-foreground",
                    (ui.uiStatus === "missed" || ui.uiStatus === "pending") && "text-muted-foreground",
                    ui.uiStatus === "available" && "text-foreground",
                  )}
                >
                  {t.title}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{t.description}</p>
                )}
                {ui.hint && (
                  <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {ui.hint}
                  </div>
                )}
              </div>

              {/* Status badge / CTA */}
              <div className="shrink-0 flex flex-col items-end gap-2">
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border",
                    ui.uiStatus === "done" && "text-success border-success/30 bg-success/5",
                    ui.uiStatus === "available" && "text-primary border-primary/40 bg-primary/10",
                    ui.uiStatus === "overdue" && "text-warning border-warning/30 bg-warning/5",
                    ui.uiStatus === "missed" && "text-destructive border-destructive/30 bg-destructive/5",
                    ui.uiStatus === "pending" && "text-muted-foreground/60 border-border/60",
                  )}
                >
                  {STATUS_LABEL[ui.uiStatus]}
                </span>
                {ui.uiStatus === "available" && route && (
                  <Button
                    size="sm"
                    onClick={() => navigate(route)}
                    className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider"
                  >
                    Fill in
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
