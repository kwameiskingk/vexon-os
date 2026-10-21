import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Smile, Meh, Frown, SmilePlus, Angry, MessageCircle, CheckCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getUKDateString } from "@/utils/timezoneUtils";

const moodOptions = [
  { value: "very_happy", icon: SmilePlus, label: "Very Happy", color: "text-green-500" },
  { value: "happy", icon: Smile, label: "Happy", color: "text-green-400" },
  { value: "neutral", icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: "unhappy", icon: Frown, label: "Unhappy", color: "text-orange-500" },
  { value: "very_unhappy", icon: Angry, label: "Very Unhappy", color: "text-red-500" },
];

interface ExistingSubmission {
  id: string;
  mood: string;
  what_you_did: string | null;
  what_went_well: string | null;
  what_you_struggled_with: string | null;
}

export const GeneralEODButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    mood: "",
    whatYouDid: "",
    whatWentWell: "",
    whatYouStruggled: "",
  });
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkExistingSubmission();
  }, []);

  const checkExistingSubmission = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    const today = getUKDateString();
    const { data } = await supabase
      .from('setter_feedback')
      .select('id, mood, what_you_did, what_went_well, what_you_struggled_with')
      .eq('setter_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (data) {
      setAlreadySubmitted(true);
      setExistingSubmission(data);
    } else {
      setAlreadySubmitted(false);
      setExistingSubmission(null);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.mood) {
      toast.error("Please select your mood");
      return;
    }

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSubmitting(false);
      return;
    }

    // Get user profile and role
    const [{ data: profile }, { data: userRole }, { data: setterProfile }] = await Promise.all([
      supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
      supabase.from("setters_profiles").select("email, full_name").eq("user_id", user.id).maybeSingle(),
    ]);

    const { error } = await supabase.from("setter_feedback").insert({
      setter_id: user.id,
      date: getUKDateString(),
      email: setterProfile?.email || profile?.email || user.email || "",
      role: userRole?.role || "admin",
      mood: formData.mood,
      what_you_did: formData.whatYouDid,
      what_went_well: formData.whatWentWell,
      what_you_struggled_with: formData.whatYouStruggled,
      submitted_at_uk: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') {
        toast.error("You've already submitted your EOD for today");
        setAlreadySubmitted(true);
        checkExistingSubmission();
      } else {
        toast.error(`Failed to submit feedback: ${error.message}`);
        console.error("EOD submission error:", error);
      }
    } else {
      toast.success("EOD feedback submitted successfully!");
      setIsOpen(false);
      setFormData({ mood: "", whatYouDid: "", whatWentWell: "", whatYouStruggled: "" });
      setAlreadySubmitted(true);
      checkExistingSubmission();
    }
    setIsSubmitting(false);
  };

  const getMoodLabel = (moodValue: string) => {
    const mood = moodOptions.find(m => m.value === moodValue);
    return mood ? mood.label : moodValue;
  };

  const getMoodIcon = (moodValue: string) => {
    const mood = moodOptions.find(m => m.value === moodValue);
    return mood ? mood.icon : Meh;
  };

  const getMoodColor = (moodValue: string) => {
    const mood = moodOptions.find(m => m.value === moodValue);
    return mood ? mood.color : "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-lg border-border/50 bg-card/50"
        disabled
      >
        <MessageCircle className="h-4 w-4 animate-pulse" />
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-8 w-8 rounded-lg transition-all ${
                  alreadySubmitted 
                    ? "border-green-500/50 bg-green-500/10 text-green-500 hover:bg-green-500/20" 
                    : "border-border/50 bg-card/50 hover:bg-primary/10 hover:border-primary/50"
                }`}
              >
                {alreadySubmitted ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{alreadySubmitted ? "EOD Submitted ✓" : "End-of-Day Feedback"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {alreadySubmitted ? "Today's EOD Submission" : "How was your day?"}
          </DialogTitle>
        </DialogHeader>
        
        {alreadySubmitted && existingSubmission ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                You've already submitted your EOD for today
              </span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground">Mood:</Label>
                {(() => {
                  const MoodIcon = getMoodIcon(existingSubmission.mood);
                  return (
                    <div className="flex items-center gap-2">
                      <MoodIcon className={`h-5 w-5 ${getMoodColor(existingSubmission.mood)}`} />
                      <span className="font-medium">{getMoodLabel(existingSubmission.mood)}</span>
                    </div>
                  );
                })()}
              </div>
              
              {existingSubmission.what_you_did && (
                <div>
                  <Label className="text-muted-foreground">What you did:</Label>
                  <p className="mt-1 text-sm">{existingSubmission.what_you_did}</p>
                </div>
              )}
              
              {existingSubmission.what_went_well && (
                <div>
                  <Label className="text-muted-foreground">What went well:</Label>
                  <p className="mt-1 text-sm">{existingSubmission.what_went_well}</p>
                </div>
              )}
              
              {existingSubmission.what_you_struggled_with && (
                <div>
                  <Label className="text-muted-foreground">What you struggled with:</Label>
                  <p className="mt-1 text-sm">{existingSubmission.what_you_struggled_with}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
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
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all ${
                        formData.mood === option.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${option.color}`} />
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
