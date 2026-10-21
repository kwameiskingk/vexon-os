// Pace-curve editor — Nadia sets the team-wide weekday shape that paces the
// weekly SAT target. One shape for the department; per-setter amounts come
// from the target resolver. Writes are RLS-gated (admin/dev now; sdr_manager
// joins with the Phase-4 policy change) — a blocked save surfaces a clear
// toast, never a silent failure.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPaceCurve,
  weightsAreValid,
  type WeekWeights,
} from "@/lib/targets/paceExpectation";

const DAYS: Array<{ key: keyof WeekWeights; label: string }> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
];

/**
 * `variant="board"` renders the token-system look for the Metrics & Insights
 * disclosure panel (wells, brand save button, no Card chrome — the popover
 * provides it). The default variant is byte-identical to before and is what
 * the Dev Center Targets module renders — that surface must not change.
 */
export function PaceCurveEditor({
  department = "fulfilment",
  variant = "default",
}: { department?: string; variant?: "default" | "board" }) {
  const board = variant === "board";
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState<WeekWeights | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: currentWeights } = useQuery({
    queryKey: ["pace-curve", department],
    queryFn: () => fetchPaceCurve(department),
  });

  useEffect(() => {
    if (currentWeights && !weights) setWeights(currentWeights);
  }, [currentWeights, weights]);

  if (!weights) return null;

  const sum = DAYS.reduce((s, d) => s + (Number(weights[d.key]) || 0), 0);
  const valid = weightsAreValid(weights);

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pace_curves")
        .upsert(
          {
            department,
            period: "week",
            weights,
            updated_by: user?.id ?? null,
          },
          { onConflict: "department,period" },
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["pace-curve", department] });
      queryClient.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
      toast.success("Pace curve saved — RAG expectations now follow the new shape");
    } catch (error: any) {
      console.error("Error saving pace curve:", error);
      toast.error(`Couldn't save the curve: ${error?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className={cn(
        "relative",
        // overflow-hidden only where the rail needs corner clipping (default
        // variant); in the popover it clipped the info tooltip pre-portal.
        board ? "overflow-visible border-0 bg-transparent shadow-none" : "overflow-hidden border-border/60 bg-card/60",
      )}
    >
      {/* 3px brand rail — matches the premium card treatment (default only) */}
      {!board && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/70" />}
      <CardContent className={board ? "p-0" : "py-4 pl-6 pr-5"}>
        <div className="flex items-center gap-2 mb-3">
          <p
            className={
              board
                ? "micro-label uppercase text-txt-muted"
                : "font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70"
            }
          >
            <span className="text-muted-foreground/30">[</span> weekly pace curve · {department}{" "}
            <span className="text-muted-foreground/30">]</span>
          </p>
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="bottom" align="start">
              <div className="space-y-2 text-xs">
                <h4 className="font-semibold text-sm">How the pace curve works</h4>
                <p>
                  The curve spreads the <span className="font-medium">weekly booked and sat
                  targets</span> across the week, so mid-week the system can judge whether
                  a setter's running total is on pace or falling behind.
                </p>
                <p>
                  Each day's number is that day's share of the week — the five must
                  total 100. Days a setter didn't work are taken out of their
                  expectation first, so absences never count against anyone.
                </p>
                <p>
                  It only affects <span className="font-medium">booked and sat</span>.
                  Dials and talk time are daily targets and ignore the curve entirely.
                </p>
                <p className="text-muted-foreground border-t border-border/40 pt-2">
                  Example: even 20/20/20/20/20 = steady progress expected all week;
                  front-loaded 30/25/20/15/10 = more expected early in the week.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          {DAYS.map((d) => (
            <div key={d.key} className={board ? "w-20" : "w-[4.25rem]"}>
              <Label
                htmlFor={`curve-${d.key}`}
                className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70"
              >
                {d.label}
              </Label>
              <div className="relative mt-1">
                <Input
                  id={`curve-${d.key}`}
                  type="number"
                  min={0}
                  max={100}
                  className={cn(
                    "h-9 pr-6 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    board
                      ? "board-well border-[var(--hairline)] px-2.5 font-heading text-sm font-semibold text-txt-primary focus-visible:border-brand-500/60"
                      : "text-sm font-heading bg-muted/30 border-border/60 focus-visible:border-primary/50",
                  )}
                  value={weights[d.key]}
                  onChange={(e) =>
                    setWeights({ ...weights, [d.key]: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 pointer-events-none">%</span>
              </div>
              {/* Miniature shape preview: each day's bar scaled to its weight */}
              <div
                className={cn(
                  "mt-1.5 h-1 rounded-full overflow-hidden",
                  board ? "bg-surface-track" : "bg-muted-foreground/10",
                )}
              >
                <div
                  className={cn(
                    "h-full transition-[width] duration-200 ease-out",
                    board ? "bg-brand-500" : "bg-primary/50",
                  )}
                  style={{ width: `${Math.min(100, (Number(weights[d.key]) || 0) * 2.5)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2.5 ml-auto pb-1.5">
            <span
              className={cn(
                "tabular-nums px-2 py-1 border",
                board
                  ? "board-well rounded-well micro-label uppercase"
                  : "font-mono text-[10px] uppercase tracking-[0.14em] rounded-md",
                valid
                  ? board
                    ? "text-txt-muted"
                    : "text-muted-foreground border-border/60 bg-muted/30"
                  : board
                    ? "text-rag-crit border-rag-crit/40 font-medium"
                    : "text-red-500 border-red-500/40 bg-red-500/10 font-medium",
              )}
            >
              Σ {sum}%{!valid && " · must equal 100"}
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!valid || saving}
              className={cn(
                "active:scale-[0.97] transition-transform duration-150 ease-out",
                board &&
                  "rounded-well border-0 text-white [background:var(--grad-btn)] shadow-[0_5px_12px_-5px_rgba(107,122,144,.5)] hover:opacity-95",
              )}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save curve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
