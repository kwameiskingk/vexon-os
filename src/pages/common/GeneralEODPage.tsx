import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Smile, Meh, Frown, SmilePlus, Angry, CheckCircle } from "lucide-react";
import { getUKDateString } from "@/utils/timezoneUtils";
import { useAuth } from "@/contexts/AuthContext";

const moodOptions = [
  { value: "very_unhappy", icon: Angry, label: "Very Unhappy", color: "text-red-500" },
  { value: "unhappy", icon: Frown, label: "Unhappy", color: "text-orange-500" },
  { value: "neutral", icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: "happy", icon: Smile, label: "Happy", color: "text-green-400" },
  { value: "very_happy", icon: SmilePlus, label: "Very Happy", color: "text-green-500" },
];

interface ExistingSubmission {
  id: string;
  mood: string;
  what_you_did: string | null;
  what_went_well: string | null;
  what_you_struggled_with: string | null;
  calls_reviewed: number | null;
}

interface GeneralEODPageProps {
  layoutRole: "admin" | "setter" | "client";
}

const GeneralEODPage = ({ layoutRole }: GeneralEODPageProps) => {
  const { userRole, userRoles } = useAuth();
  const isSdrManager = userRoles.includes("sdr_manager");
  const [formData, setFormData] = useState({ mood: "", whatYouDid: "", callsReviewed: "", whatWentWell: "", whatYouStruggled: "" });
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { checkExistingSubmission(); }, []);

  const checkExistingSubmission = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }
    const today = getUKDateString();
    const { data } = await supabase.from('setter_feedback')
      .select('id, mood, what_you_did, what_went_well, what_you_struggled_with, calls_reviewed')
      .eq('setter_id', user.id).eq('date', today).maybeSingle();
    if (data) { setAlreadySubmitted(true); setExistingSubmission(data as any); }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.mood) { toast.error("Please select your mood"); return; }
    if (!formData.whatYouDid.trim()) { toast.error("Please describe what you did today"); return; }
    if (isSdrManager && !formData.callsReviewed) { toast.error("Please enter how many calls you reviewed today"); return; }
    if (!formData.whatWentWell.trim()) { toast.error("Please share what went well"); return; }
    if (!formData.whatYouStruggled.trim()) { toast.error("Please share what you struggled with"); return; }
    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSubmitting(false); return; }

    const [{ data: profile }, { data: ur }, { data: setterProfile }] = await Promise.all([
      supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
      supabase.from("setters_profiles").select("email, full_name").eq("user_id", user.id).maybeSingle(),
    ]);

    const { error } = await supabase.from("setter_feedback").insert({
      setter_id: user.id,
      date: getUKDateString(),
      email: setterProfile?.email || profile?.email || user.email || "",
      role: ur?.role || "admin",
      mood: formData.mood,
      what_you_did: formData.whatYouDid,
      what_went_well: formData.whatWentWell,
      what_you_struggled_with: formData.whatYouStruggled,
      calls_reviewed: isSdrManager && formData.callsReviewed ? parseInt(formData.callsReviewed, 10) : null,
      submitted_at_uk: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') { toast.error("You've already submitted your EOD for today"); setAlreadySubmitted(true); checkExistingSubmission(); }
      else { toast.error(`Failed to submit feedback: ${error.message}`); console.error("EOD submission error:", error); }
    } else {
      toast.success("EOD feedback submitted successfully!");
      setFormData({ mood: "", whatYouDid: "", callsReviewed: "", whatWentWell: "", whatYouStruggled: "" });
      setAlreadySubmitted(true);
      checkExistingSubmission();
    }
    setIsSubmitting(false);
  };

  const getMoodLabel = (v: string) => moodOptions.find(m => m.value === v)?.label || v;
  const getMoodIcon = (v: string) => moodOptions.find(m => m.value === v)?.icon || Meh;
  const getMoodColor = (v: string) => moodOptions.find(m => m.value === v)?.color || "text-muted-foreground";

  return (
    <DashboardLayout role={layoutRole}>
      <PageContainer>
        <PageHeader title="End of Day" subtitle="Submit your daily feedback" />
        <div className="max-w-2xl mx-auto">
          {isLoading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : alreadySubmitted && existingSubmission ? (
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">All clear — EOD submitted for today</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground">Mood:</Label>
                    {(() => { const I = getMoodIcon(existingSubmission.mood); return <div className="flex items-center gap-2"><I className={`h-5 w-5 ${getMoodColor(existingSubmission.mood)}`} /><span className="font-medium">{getMoodLabel(existingSubmission.mood)}</span></div>; })()}
                  </div>
                  {existingSubmission.what_you_did && <div><Label className="text-muted-foreground">What you did:</Label><p className="mt-1 text-sm">{existingSubmission.what_you_did}</p></div>}
                  {isSdrManager && typeof existingSubmission.calls_reviewed === "number" && (
                    <div><Label className="text-muted-foreground">Calls reviewed today:</Label><p className="mt-1 text-sm font-medium">{existingSubmission.calls_reviewed}</p></div>
                  )}
                  {existingSubmission.what_went_well && <div><Label className="text-muted-foreground">What went well:</Label><p className="mt-1 text-sm">{existingSubmission.what_went_well}</p></div>}
                  {existingSubmission.what_you_struggled_with && <div><Label className="text-muted-foreground">What you struggled with:</Label><p className="mt-1 text-sm">{existingSubmission.what_you_struggled_with}</p></div>}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-3">
                    <Label>How was your day?</Label>
                    <div className="flex justify-between gap-2">
                      {moodOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button key={option.value} type="button" onClick={() => setFormData({ ...formData, mood: option.value })}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all flex-1 ${formData.mood === option.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                            <Icon className={`h-7 w-7 ${option.color}`} />
                            <span className="text-xs">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>What did you do today?</Label>
                    <Textarea value={formData.whatYouDid} onChange={(e) => setFormData({ ...formData, whatYouDid: e.target.value })} placeholder="Describe your activities today..." rows={3} />
                  </div>
                  {isSdrManager && (
                    <div className="space-y-2">
                      <Label>How many calls did you review today? <span className="text-destructive">*</span></Label>
                      <Input type="number" min="0" value={formData.callsReviewed} onChange={(e) => setFormData({ ...formData, callsReviewed: e.target.value })} placeholder="Enter total calls reviewed..." required />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>What went well today?</Label>
                    <Textarea value={formData.whatWentWell} onChange={(e) => setFormData({ ...formData, whatWentWell: e.target.value })} placeholder="Share your wins and successes..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>What did you struggle with today?</Label>
                    <Textarea value={formData.whatYouStruggled} onChange={(e) => setFormData({ ...formData, whatYouStruggled: e.target.value })} placeholder="Share any challenges or difficulties..." rows={3} />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Feedback"}</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default GeneralEODPage;
