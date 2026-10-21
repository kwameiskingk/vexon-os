import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { APPOINTMENT_RUBRIC } from "@/lib/appointmentRubric";
import { SCORE_DIMENSIONS, type MeetingScore, type ScoreValue } from "@/lib/meetingScores";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ScorableMeeting {
  id: string;
  meeting_date: string;
  company_name: string | null;
  prospect_name: string | null;
  setterName: string;
  clientName: string;
}

interface ScoreMeetingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: ScorableMeeting | null;
  /** Existing native score when re-scoring; null for first-time scoring. */
  existingScore?: MeetingScore | null;
  onSaved: () => void;
}

type Scores = Partial<Record<"fit" | "engagement" | "authority" | "next_step", ScoreValue>>;

export function ScoreMeetingDrawer({
  open,
  onOpenChange,
  meeting,
  existingScore = null,
  onSaved,
}: ScoreMeetingDrawerProps) {
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existingScore) {
      setScores({
        fit: existingScore.fit as ScoreValue,
        engagement: existingScore.engagement as ScoreValue,
        authority: existingScore.authority as ScoreValue,
        next_step: existingScore.next_step as ScoreValue,
      });
      setNotes(existingScore.notes || "");
    } else {
      setScores({});
      setNotes("");
    }
  }, [open, existingScore]);

  const allScored = SCORE_DIMENSIONS.every(({ key }) => scores[key] != null);
  // Display-only preview — the DB's generated overall_quality column is authoritative.
  const overallPreview = useMemo(() => {
    if (!allScored) return null;
    const vals = SCORE_DIMENSIONS.map(({ key }) => scores[key] as number);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [scores, allScored]);

  const handleSave = async () => {
    if (!meeting || !allScored) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        fit: scores.fit,
        engagement: scores.engagement,
        authority: scores.authority,
        next_step: scores.next_step,
        notes: notes.trim() || null,
      };
      if (existingScore) {
        const { error } = await supabase
          .from("meeting_scores")
          .update(payload)
          .eq("id", existingScore.id);
        if (error) throw error;
        toast.success("Score updated");
      } else {
        const { error } = await supabase.from("meeting_scores").insert({
          ...payload,
          appointment_id: meeting.id,
          meeting_date: meeting.meeting_date,
          setter_name: meeting.setterName,
          client_name: meeting.clientName,
          prospect_company: meeting.company_name || "",
          matched: true,
          source: "native",
          scored_by: user?.id ?? null,
        });
        if (error) {
          if (error.code === "23505") {
            toast.error("This meeting already has a score — refreshing the list.");
            onSaved();
            onOpenChange(false);
            return;
          }
          throw error;
        }
        toast.success("Appointment scored");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save score");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {existingScore ? "Re-score appointment" : "Score appointment"}
          </SheetTitle>
        </SheetHeader>

        {meeting && (
          <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-semibold">
              {meeting.company_name || "Unknown company"}
              {meeting.prospect_name ? ` — ${meeting.prospect_name}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(meeting.meeting_date), "EEE d MMM yyyy")} · Setter:{" "}
              {meeting.setterName} · Client: {meeting.clientName}
            </p>
          </div>
        )}

        <div className="mt-5 space-y-5">
          {APPOINTMENT_RUBRIC.map((criterion) => {
            const label = SCORE_DIMENSIONS.find((d) => d.key === criterion.key)?.label;
            const selected = scores[criterion.key];
            return (
              <div key={criterion.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">{label}</p>
                  <span className="text-xs text-muted-foreground">
                    {selected != null ? `${selected}/5` : "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{criterion.description}</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {([1, 2, 3, 4, 5] as ScoreValue[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setScores((cur) => ({ ...cur, [criterion.key]: v }))
                      }
                      className={cn(
                        "h-9 rounded-md border text-sm font-semibold tabular-nums transition-colors",
                        selected === v
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-card hover:bg-muted",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground min-h-[1.5em]">
                  {selected != null
                    ? criterion.levels[selected]
                    : "Select a score to see the rubric guidance."}
                </p>
              </div>
            );
          })}

          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Notes</p>
            <Textarea
              placeholder="Anything worth recording about this meeting..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Overall: </span>
            <span className="font-semibold tabular-nums">
              {overallPreview == null ? "—" : overallPreview.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground"> /5</span>
            {overallPreview != null && (
              <span
                className={cn(
                  "ml-2 text-[11px] font-medium",
                  overallPreview >= 4
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {overallPreview >= 4 ? "Quality meeting" : "Below quality threshold"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!allScored || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {existingScore ? "Update score" : "Save score"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
