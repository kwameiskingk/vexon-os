import { useNavigate } from "react-router-dom";
import { ClipboardList, ArrowRight, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useTaskInstances } from "@/hooks/useTaskInstances";
import { PersonalTaskQuickAdd } from "@/components/tasks/PersonalTaskQuickAdd";
import { getTaskUiState, formatSlotRange } from "@/utils/taskStatus";
import { useUserTimezone } from "@/utils/timezoneUtils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const TaskCenter = () => {
  const navigate = useNavigate();
  const { data: instances = [], toggle } = useTaskInstances();
  const tz = useUserTimezone();

  const enriched = instances.map((t) => ({ task: t, ui: getTaskUiState(t, tz) }));
  const open = enriched.filter((e) => e.task.status === "open");
  const actionable = open.filter((e) => e.ui.uiStatus === "available" || e.ui.uiStatus === "overdue");
  const done = instances.filter((i) => i.status === "done").length;
  const total = instances.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const upcoming = [...actionable, ...open.filter((e) => !actionable.includes(e))].slice(0, 3);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ClipboardList className="h-5 w-5" />
          {actionable.length > 0 && (
            <Badge
              variant="secondary"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-primary text-primary-foreground"
            >
              {actionable.length > 9 ? "9+" : actionable.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Task Center</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="rounded-2xl border border-border/40 bg-card/60 p-4 flex items-center gap-4">
            <ProgressRing value={pct} max={100} size={64} strokeWidth={6} label={`${pct}%`} />
            <div className="flex-1">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Today
              </div>
              <div className="text-xl font-semibold">{done} / {total} done</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {actionable.length} need action now
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Up next
            </div>
            {upcoming.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-center text-sm text-muted-foreground">
                All caught up. 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map(({ task: t, ui }) => {
                  const slotRange = ui.isHourly && t.link_slot != null ? formatSlotRange(t.link_slot) : null;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3",
                        ui.uiStatus === "available" && "border-primary/40 bg-primary/5",
                        ui.uiStatus === "overdue" && "border-warning/30 bg-warning/5",
                        ui.uiStatus === "missed" && "border-destructive/25 bg-destructive/5 opacity-70",
                        ui.uiStatus === "pending" && "border-border/40 bg-card/40 opacity-70",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {slotRange || (t.due_at ? format(new Date(t.due_at), "h:mm a") : "")}
                        </div>
                        <div className="text-sm font-medium truncate">{t.title}</div>
                      </div>
                      {ui.uiStatus === "available" && ui.canToggle && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-primary/40"
                          onClick={() => toggle.mutate({ id: t.id, status: "done" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {ui.uiStatus === "available" && !ui.canToggle && (
                        <span className="text-[9px] font-mono uppercase tracking-wider text-primary">
                          Open
                        </span>
                      )}
                      {ui.uiStatus === "overdue" && ui.canToggle && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-warning/40"
                          onClick={() => toggle.mutate({ id: t.id, status: "done" })}
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-warning" />
                        </Button>
                      )}
                      {(ui.uiStatus === "missed" || ui.uiStatus === "pending") && (
                        <Lock className={cn(
                          "h-3.5 w-3.5",
                          ui.uiStatus === "missed" ? "text-destructive" : "text-muted-foreground",
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <PersonalTaskQuickAdd />

          <Button variant="default" className="w-full" onClick={() => navigate("/tasks")}>
            Open Tasks &amp; Responsibilities
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
