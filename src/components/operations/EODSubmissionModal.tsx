import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Smile, Meh, Frown, SmilePlus, Angry } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUKDateString } from "@/utils/timezoneUtils";

const moodOptions = [
  { value: "very_unhappy", icon: Angry, label: "Very Unhappy", color: "text-red-500" },
  { value: "unhappy", icon: Frown, label: "Unhappy", color: "text-orange-500" },
  { value: "neutral", icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: "happy", icon: Smile, label: "Happy", color: "text-green-400" },
  { value: "very_happy", icon: SmilePlus, label: "Very Happy", color: "text-green-500" },
];

interface EODSubmissionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** When true, modal is rendered as a preview and submits are dry-run */
  isTest?: boolean;
}

export const EODSubmissionModal = ({ open, onOpenChange, onSuccess, isTest = false }: EODSubmissionModalProps) => {
  const [formData, setFormData] = useState({
    mood: "",
    whatYouDid: "",
    whatWentWell: "",
    whatYouStruggled: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.mood) {
      toast.error("Please select your mood");
      return;
    }

    if (isTest) {
      toast.success("Test complete — no data was saved");
      onOpenChange(false);
      setFormData({ mood: "", whatYouDid: "", whatWentWell: "", whatYouStruggled: "" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be signed in to submit");
        return;
      }

      // Try to get from setters_profiles first, then fall back to profiles
      const { data: setterProfile } = await supabase
        .from("setters_profiles")
        .select("email, full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const now = new Date().toISOString();
      const { error } = await supabase.from("setter_feedback").insert({
        setter_id: user.id,
        date: getUKDateString(),
        email: setterProfile?.email || profile?.email || user.email || "",
        role: userRole?.role || "admin",
        mood: formData.mood,
        what_you_did: formData.whatYouDid,
        what_went_well: formData.whatWentWell,
        what_you_struggled_with: formData.whatYouStruggled,
        submitted_at_uk: now,
      });

      if (error) {
        toast.error(`Failed to submit EOD form: ${error.message}`);
        console.error("EOD submission error:", error);
      } else {
        toast.success("EOD form submitted successfully!");
        onOpenChange(false);
        setFormData({ mood: "", whatYouDid: "", whatWentWell: "", whatYouStruggled: "" });
        onSuccess();
      }
    } catch (err: any) {
      console.error("EOD unexpected error:", err);
      toast.error(`Unexpected error: ${err?.message || "Please try again"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Submit End of Day Form
            {isTest && <span className="ml-2 text-xs text-muted-foreground">(Test mode)</span>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label>Select your mood</Label>
            <div className="flex justify-between gap-2">
              {moodOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, mood: option.value })}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      formData.mood === option.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon className={`h-8 w-8 ${option.color}`} />
                    <span className="text-xs">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>What did you do today?</Label>
            <Textarea
              value={formData.whatYouDid}
              onChange={(e) => setFormData({ ...formData, whatYouDid: e.target.value })}
              placeholder="Describe your activities today..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>What went well today?</Label>
            <Textarea
              value={formData.whatWentWell}
              onChange={(e) => setFormData({ ...formData, whatWentWell: e.target.value })}
              placeholder="Share your wins and successes..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>What did you struggle with today?</Label>
            <Textarea
              value={formData.whatYouStruggled}
              onChange={(e) => setFormData({ ...formData, whatYouStruggled: e.target.value })}
              placeholder="Share any challenges or difficulties..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit EOD</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
