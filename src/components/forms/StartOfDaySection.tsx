import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Smile, Meh, Frown, SmilePlus, Angry, CheckCircle } from "lucide-react";
import { getUKDateString } from "@/utils/timezoneUtils";

const moodOptions = [
  { value: "very_unhappy", icon: Angry, label: "Very Unhappy", color: "text-red-500" },
  { value: "unhappy", icon: Frown, label: "Unhappy", color: "text-orange-500" },
  { value: "neutral", icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: "happy", icon: Smile, label: "Happy", color: "text-green-400" },
  { value: "very_happy", icon: SmilePlus, label: "Very Happy", color: "text-green-500" },
];

export function StartOfDaySection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    mood: "",
    plannedActivities: "",
    topPriorities: "",
    successDefinition: "",
    blockers: "",
    anythingElse: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("start_of_day_submissions")
        .select("id, missed")
        .eq("user_id", user.id)
        .eq("date", getUKDateString())
        .maybeSingle();
      if (data && !data.missed) setAlreadySubmitted(true);
      setLoading(false);
    })();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.mood) {
      toast.error("Please select your mood");
      return;
    }
    setSubmitting(true);
    const now = new Date();
    const { error } = await supabase
      .from("start_of_day_submissions")
      .upsert(
        {
          user_id: user.id,
          date: getUKDateString(),
          mood: formData.mood,
          planned_activities: formData.plannedActivities || null,
          top_priorities: formData.topPriorities || null,
          success_definition: formData.successDefinition || null,
          blockers: formData.blockers || null,
          anything_else: formData.anythingElse || null,
          submitted_at: now.toISOString(),
          uk_submitted_at: now.toISOString(),
          missed: false,
        },
        { onConflict: "user_id,date" }
      );

    if (error) {
      toast.error("Failed to submit: " + error.message);
    } else {
      toast.success("Start of Day form submitted!");
      setAlreadySubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["start-of-day-pending"] });
      queryClient.invalidateQueries({ queryKey: ["task-instances", user.id] });
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (alreadySubmitted) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            You've already submitted your Start of Day form for today.
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div className="space-y-3">
        <Label>How are you feeling today?</Label>
        <div className="flex justify-between gap-2">
          {moodOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData({ ...formData, mood: option.value })}
                className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  formData.mood === option.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className={`h-7 w-7 ${option.color}`} />
                <span className="text-[11px]">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>What are you planning to do today?</Label>
        <Textarea
          value={formData.plannedActivities}
          onChange={(e) => setFormData({ ...formData, plannedActivities: e.target.value })}
          placeholder="Describe your key activities for today..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>What are your top 3 to 5 priorities?</Label>
        <Textarea
          value={formData.topPriorities}
          onChange={(e) => setFormData({ ...formData, topPriorities: e.target.value })}
          placeholder="List the most important things you need to get done..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>What would make today successful?</Label>
        <Textarea
          value={formData.successDefinition}
          onChange={(e) => setFormData({ ...formData, successDefinition: e.target.value })}
          placeholder="Define what a good outcome looks like..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Is there anything that might block you today?</Label>
        <Textarea
          value={formData.blockers}
          onChange={(e) => setFormData({ ...formData, blockers: e.target.value })}
          placeholder="Share any risks, concerns, or dependencies..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Anything else to share?</Label>
        <Textarea
          value={formData.anythingElse}
          onChange={(e) => setFormData({ ...formData, anythingElse: e.target.value })}
          placeholder="Optional..."
          rows={2}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Submitting..." : "Submit Start of Day"}
      </Button>
    </form>
  );
}
