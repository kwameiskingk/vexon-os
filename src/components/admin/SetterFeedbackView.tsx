import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Smile, Meh, Frown, SmilePlus, Angry, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface Feedback {
  id: string;
  setter_id: string;
  date: string;
  mood: string;
  role: string | null;
  // Original questions (non-setter)
  what_you_did: string | null;
  what_went_well: string | null;
  what_you_struggled_with: string | null;
  // Setter-specific questions
  meetings_booked_today: number | null;
  emails_sent_today: number | null;
  objections_struggled: string | null;
  training_needed: string | null;
  setter_name?: string;
}

const moodIcons: Record<string, { icon: any; color: string; label: string }> = {
  very_happy: { icon: SmilePlus, label: "Very Happy", color: "text-green-500 bg-green-500/10" },
  happy: { icon: Smile, label: "Happy", color: "text-green-400 bg-green-400/10" },
  neutral: { icon: Meh, label: "Neutral", color: "text-yellow-500 bg-yellow-500/10" },
  unhappy: { icon: Frown, label: "Unhappy", color: "text-orange-500 bg-orange-500/10" },
  very_unhappy: { icon: Angry, label: "Very Unhappy", color: "text-red-500 bg-red-500/10" },
};

export const SetterFeedbackView = () => {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadFeedback();
  }, [selectedDate]);

  const loadFeedback = async () => {
    setLoading(true);
    const { data: feedbackData } = await supabase
      .from("setter_feedback")
      .select("*")
      .eq("date", selectedDate)
      .order("created_at", { ascending: false });

    if (feedbackData) {
      // Get setter names
      const feedbackWithNames = await Promise.all(
        feedbackData.map(async (fb) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", fb.setter_id)
            .maybeSingle();

          return {
            ...fb,
            setter_name: profile?.full_name || "Unknown",
          };
        })
      );

      setFeedback(feedbackWithNames);
    }
    setLoading(false);
  };

  const isSetterSubmission = (fb: Feedback) => {
    // Check if it's a setter submission by looking for setter-specific fields
    return fb.role === 'setter' || fb.meetings_booked_today !== null || fb.objections_struggled !== null || fb.training_needed !== null;
  };

  const getRoleBadge = (role: string | null) => {
    if (!role) return null;
    const roleColors: Record<string, string> = {
      setter: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      ops: "bg-green-500/20 text-green-400 border-green-500/30",
      dev: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      csm: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      account_executive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      sdr_manager: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    };
    return (
      <Badge variant="outline" className={`text-xs ${roleColors[role] || ''}`}>
        {role.replace('_', ' ')}
      </Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading feedback...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Daily Feedback</h2>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      
      {feedback.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground">
            No feedback submitted for {format(new Date(selectedDate), 'MMMM d, yyyy')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {feedback.map((fb) => {
            const moodData = moodIcons[fb.mood];
            const MoodIcon = moodData?.icon || Meh;
            const isSetter = isSetterSubmission(fb);

            return (
              <Card key={fb.id} className="border-border shadow-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{fb.setter_name}</CardTitle>
                      {getRoleBadge(fb.role)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${moodData?.color || ""}`}>
                        <MoodIcon className="h-5 w-5" />
                        <span className="text-sm font-medium">{moodData?.label || fb.mood}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isSetter ? (
                    // Setter-specific fields
                    <>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground mb-1">Meetings booked today:</p>
                        <p className="text-sm font-medium">{fb.meetings_booked_today ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground mb-1">Emails sent today:</p>
                        <p className="text-sm font-medium">{fb.emails_sent_today ?? 0}</p>
                      </div>
                      {fb.objections_struggled && (
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Objections struggled with:</p>
                          <p className="text-sm">{fb.objections_struggled}</p>
                        </div>
                      )}
                      {fb.training_needed && (
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Training needed:</p>
                          <p className="text-sm">{fb.training_needed}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Non-setter fields (original questions)
                    <>
                      {fb.what_you_did && (
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">What they did:</p>
                          <p className="text-sm">{fb.what_you_did}</p>
                        </div>
                      )}
                      {fb.what_went_well && (
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">What went well:</p>
                          <p className="text-sm">{fb.what_went_well}</p>
                        </div>
                      )}
                      {fb.what_you_struggled_with && (
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">What they struggled with:</p>
                          <p className="text-sm">{fb.what_you_struggled_with}</p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
