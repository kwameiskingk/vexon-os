import { useState, useEffect } from "react";
import { StartOfDaySection } from "@/components/forms/StartOfDaySection";
import { HourlyUpdateSection } from "@/components/forms/HourlyUpdateSection";
import { useHourlyFormRequired } from "@/hooks/useHourlyFormRequired";
import { useFormVisibility } from "@/hooks/useFormVisibility";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/ui-v2";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { getUKDateString } from "@/utils/timezoneUtils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Smile, Meh, Frown, SmilePlus, Angry, CheckCircle, ChevronDown, CalendarDays, Palmtree, Thermometer, Heart, Send, FileUp, X, CheckCircle2, Clock, XCircle, Plus, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";

// ── EOD Section ──────────────────────────────────────────────

const moodOptions = [
  { value: "very_unhappy", icon: Angry, label: "Very Unhappy", color: "text-red-500" },
  { value: "unhappy", icon: Frown, label: "Unhappy", color: "text-orange-500" },
  { value: "neutral", icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: "happy", icon: Smile, label: "Happy", color: "text-green-400" },
  { value: "very_happy", icon: SmilePlus, label: "Very Happy", color: "text-green-500" },
];

interface ObjectionEntry {
  objection: string;
}

interface ExistingSubmission {
  id: string;
  mood: string;
  what_you_did: string | null;
  what_went_well: string | null;
  what_you_struggled_with: string | null;
}

function EODSection() {
  const { userRole } = useAuth();
  
  if (userRole === 'setter') {
    return <SetterEODSection />;
  }
  
  return <GeneralEODSection />;
}

function SetterEODSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({ mood: "", meetingsBooked: "", hitGoal: null as boolean | null, hitGoalNote: "", anythingElse: "" });
  const [objectionEntries, setObjectionEntries] = useState<ObjectionEntry[]>([]);
  const [currentObjection, setCurrentObjection] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const [existingObjections, setExistingObjections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { checkExistingSubmission(); }, []);

  const checkExistingSubmission = async () => {
    setIsLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setIsLoading(false); return; }
    const today = getUKDateString();
    const { data } = await supabase.from('setter_feedback')
      .select('id, mood, meetings_booked_today, hit_goal, hit_goal_note, anything_else')
      .eq('setter_id', authUser.id).eq('date', today).maybeSingle();
    if (data) {
      setAlreadySubmitted(true);
      setExistingSubmission(data);
      const { data: objData } = await supabase.from('objection_reports')
        .select('objection_text, frequency')
        .eq('setter_id', authUser.id).eq('report_date', today);
      setExistingObjections(objData || []);
    }
    setIsLoading(false);
  };

  const addObjectionEntry = () => {
    const objText = currentObjection.trim();
    if (!objText) { toast.error("Please type an objection"); return; }
    if (objectionEntries.some(e => e.objection === objText)) { toast.error("This objection is already added"); return; }
    setObjectionEntries([...objectionEntries, { objection: objText }]);
    setCurrentObjection("");
  };

  const removeObjectionEntry = (index: number) => {
    setObjectionEntries(objectionEntries.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.mood) { toast.error("Please select your mood"); return; }
    if (!formData.meetingsBooked) { toast.error("Please enter how many meetings you booked today"); return; }
    if (objectionEntries.length === 0) { toast.error("Please add at least one objection you struggled with"); return; }
    if (formData.hitGoal === null) { toast.error("Please select whether you hit your goal"); return; }
    setIsSubmitting(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setIsSubmitting(false); return; }

    const today = getUKDateString();

    const { error } = await supabase.from("setter_feedback").insert({
      setter_id: authUser.id, role: "setter", mood: formData.mood,
      date: today,
      meetings_booked_today: parseInt(formData.meetingsBooked),
      hit_goal: formData.hitGoal,
      hit_goal_note: formData.hitGoalNote.trim() || null,
      anything_else: formData.anythingElse.trim() || null,
      submitted_at_uk: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') { toast.error("You've already submitted your EOD for today"); setAlreadySubmitted(true); checkExistingSubmission(); }
      else { toast.error(`Failed to submit feedback: ${error.message}`); console.error("Setter EOD submission error:", error); }
      setIsSubmitting(false);
      return;
    }

    const objRows = objectionEntries.map(e => ({
      setter_id: authUser.id,
      objection_text: e.objection,
      frequency: 1,
      report_date: today,
    }));
    await supabase.from("objection_reports").insert(objRows);

    toast.success("Feedback submitted successfully!");
    setFormData({ mood: "", meetingsBooked: "", hitGoal: null, hitGoalNote: "", anythingElse: "" });
    setObjectionEntries([]);
    setAlreadySubmitted(true);
    checkExistingSubmission();
    queryClient.invalidateQueries({ queryKey: ["my-objection-reports"] });
    setIsSubmitting(false);
  };

  const getMoodLabel = (v: string) => moodOptions.find(m => m.value === v)?.label || v;
  const getMoodIcon = (v: string) => moodOptions.find(m => m.value === v)?.icon || Meh;
  const getMoodColor = (v: string) => moodOptions.find(m => m.value === v)?.color || "text-muted-foreground";

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  if (alreadySubmitted && existingSubmission) {
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">All clear — EOD submitted for today</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">Mood:</Label>
            {(() => { const I = getMoodIcon(existingSubmission.mood); return <div className="flex items-center gap-2"><I className={`h-5 w-5 ${getMoodColor(existingSubmission.mood)}`} /><span className="font-medium">{getMoodLabel(existingSubmission.mood)}</span></div>; })()}
          </div>
          <div><Label className="text-muted-foreground">Meetings booked today:</Label><p className="mt-1 text-sm font-medium">{existingSubmission.meetings_booked_today ?? 0}</p></div>
          {existingObjections.length > 0 && (
            <div>
              <Label className="text-muted-foreground">Objections reported:</Label>
              <div className="mt-1 space-y-1">
                {existingObjections.map((o: any, i: number) => (
                  <div key={i} className="flex items-center p-2 rounded border border-border bg-muted/30">
                    <Badge variant="outline" className="shrink-0 mr-2">{i + 1}</Badge>
                    <span className="text-sm">{o.objection_text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-muted-foreground">Hit your goal?</Label>
            <p className="mt-1 text-sm font-medium">{existingSubmission.hit_goal === true ? "Yes ✓" : existingSubmission.hit_goal === false ? "No ✗" : "—"}</p>
            {existingSubmission.hit_goal_note && <p className="mt-0.5 text-sm text-muted-foreground">{existingSubmission.hit_goal_note}</p>}
          </div>
          {existingSubmission.anything_else && <div><Label className="text-muted-foreground">Anything else:</Label><p className="mt-1 text-sm">{existingSubmission.anything_else}</p></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
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
          <Label>How many meetings did you book today? <span className="text-destructive">*</span></Label>
          <Input type="number" min="0" value={formData.meetingsBooked} onChange={(e) => setFormData({ ...formData, meetingsBooked: e.target.value })} placeholder="Enter number of meetings..." required />
        </div>

        {/* Objections */}
        <div className="space-y-3">
          <Label>Which objections did you struggle with today? <span className="text-destructive">*</span></Label>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                value={currentObjection}
                onChange={(e) => setCurrentObjection(e.target.value)}
                placeholder="Type an objection you struggled with..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addObjectionEntry(); } }}
              />
            </div>
            <Button type="button" variant="outline" onClick={addObjectionEntry} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {objectionEntries.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Objections to submit ({objectionEntries.length})</Label>
              {objectionEntries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                    <span className="text-sm truncate">{entry.objection}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeObjectionEntry(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Q3: Did you hit your goal? */}
        <div className="space-y-3">
          <Label>Did you hit your goal today? <span className="text-destructive">*</span></Label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setFormData({ ...formData, hitGoal: true })}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 transition-all ${formData.hitGoal === true ? "border-green-500 bg-green-500/10 text-green-600 dark:text-green-400" : "border-border hover:border-green-500/50"}`}>
              <ThumbsUp className="h-4 w-4" /> Yes
            </button>
            <button type="button" onClick={() => setFormData({ ...formData, hitGoal: false })}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 transition-all ${formData.hitGoal === false ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "border-border hover:border-red-500/50"}`}>
              <ThumbsDown className="h-4 w-4" /> No
            </button>
          </div>
          {formData.hitGoal !== null && (
            <Textarea
              value={formData.hitGoalNote}
              onChange={(e) => setFormData({ ...formData, hitGoalNote: e.target.value })}
              placeholder="Tell us more (optional)"
              rows={2}
            />
          )}
        </div>

        {/* Q4: Anything else? */}
        <div className="space-y-2">
          <Label>Anything else?</Label>
          <Textarea value={formData.anythingElse} onChange={(e) => setFormData({ ...formData, anythingElse: e.target.value })} placeholder="Share anything else on your mind..." rows={3} />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Feedback"}</Button>
      </form>
    </div>
  );
}
function GeneralEODSection() {
  const { userRoles } = useAuth();
  const isSdrManager = userRoles.includes("sdr_manager");
  const [formData, setFormData] = useState({ mood: "", whatYouDid: "", callsReviewed: "", whatWentWell: "", whatYouStruggled: "" });
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission & { calls_reviewed?: number | null } | null>(null);
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
      else { toast.error(`Failed to submit feedback: ${error.message}`); console.error("General EOD submission error:", error); }
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

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  }

  if (alreadySubmitted && existingSubmission) {
    return (
      <div className="p-6 space-y-5">
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
      </div>
    );
  }

  return (
    <div className="p-6">
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
    </div>
  );
}

// ── Leave Section ────────────────────────────────────────────

const reasonOptions = [
  { value: "sick", label: "Sick Leave", description: "Unwell or medical appointment", icon: Thermometer, gradient: "from-red-500/20 to-red-600/5", border: "border-red-500/20", activeBorder: "border-red-500/60", iconColor: "text-red-400" },
  { value: "holiday", label: "Holiday", description: "Annual or planned leave", icon: Palmtree, gradient: "from-emerald-500/20 to-emerald-600/5", border: "border-emerald-500/20", activeBorder: "border-emerald-500/60", iconColor: "text-emerald-400" },
  { value: "family_personal", label: "Family / Personal", description: "Family matters or personal day", icon: Heart, gradient: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/20", activeBorder: "border-violet-500/60", iconColor: "text-violet-400" },
];

function LeaveSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [leaveDaysAmount, setLeaveDaysAmount] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [doctorNoteFile, setDoctorNoteFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["leave-form-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["my-leave-requests", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("employee_leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !leaveDaysAmount || !leaveStartDate || !returnDate) { toast.error("Please fill out all required fields"); return; }
    if (parseInt(leaveDaysAmount) < 1) { toast.error("Leave days must be at least 1"); return; }
    setIsSubmitting(true);
    try {
      let doctorNotePath: string | null = null;
      if (doctorNoteFile && user?.id) {
        const fileExt = doctorNoteFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("doctor-notes").upload(filePath, doctorNoteFile);
        if (uploadError) { toast.error("Failed to upload doctor's note: " + uploadError.message); setIsSubmitting(false); return; }
        doctorNotePath = filePath;
      }
      const { error } = await supabase.from("employee_leave_requests").insert({
        user_id: user!.id, full_name: profile?.full_name || "Unknown", email: profile?.email || user!.email || "",
        reason, leave_days_amount: parseInt(leaveDaysAmount), leave_start_date: leaveStartDate, return_date: returnDate, doctor_note_path: doctorNotePath,
      });
      if (error) throw error;
      toast.success("Leave request submitted successfully");
      setReason(""); setLeaveDaysAmount(""); setLeaveStartDate(""); setReturnDate(""); setDoctorNoteFile(null);
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
    } catch (error: any) {
      toast.error("Failed to submit leave request: " + error.message);
    } finally { setIsSubmitting(false); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "rejected": return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      default: return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    }
  };

  const getReasonLabel = (r: string) => {
    switch (r) { case "sick": return "Sick Leave"; case "holiday": return "Holiday"; case "family_personal": return "Family / Personal"; default: return r; }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Form */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">New Leave Request</h3>
            <p className="text-xs text-muted-foreground">Fields marked with * are required</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity Strip */}
          <div className="rounded-xl bg-muted/40 border border-border p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">Your Details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <div className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Work Email</Label>
                <div className="text-sm font-medium text-foreground">{profile?.email || user?.email || "—"}</div>
              </div>
            </div>
          </div>

          {/* Reason Cards */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Reason for Leave <span className="text-destructive">*</span></Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {reasonOptions.map((opt) => {
                const isActive = reason === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setReason(opt.value)}
                    className={cn("relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:shadow-md",
                      isActive ? `bg-gradient-to-b ${opt.gradient} ${opt.activeBorder} shadow-sm` : `bg-card/50 ${opt.border} hover:bg-muted/40`
                    )}>
                    {isActive && <div className="absolute top-2 right-2"><CheckCircle2 className="h-4 w-4 text-primary" /></div>}
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-colors", isActive ? "bg-background/60" : "bg-muted/50")}>
                      <opt.icon className={cn("h-5 w-5", opt.iconColor)} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates & Duration */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="start_date" className="text-sm">Leave Start Date <span className="text-destructive">*</span></Label>
              <Input id="start_date" type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="return_date" className="text-sm">Return Date <span className="text-destructive">*</span></Label>
              <Input id="return_date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave_days" className="text-sm">Total Days <span className="text-destructive">*</span></Label>
              <Input id="leave_days" type="number" min="1" value={leaveDaysAmount} onChange={(e) => setLeaveDaysAmount(e.target.value)} placeholder="e.g. 3" required />
            </div>
          </div>

          {/* Doctor's Note */}
          <div className="space-y-2">
            <Label className="text-sm">Doctor's Note <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
            {!doctorNoteFile ? (
              <label htmlFor="doctor_note_forms" className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-all duration-200 group">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors"><FileUp className="h-5 w-5 text-primary" /></div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Upload Document</p>
                  <p className="text-[11px] text-muted-foreground">PDF, JPG, PNG, DOC – Max 10MB</p>
                </div>
              </label>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FileUp className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doctorNoteFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">{(doctorNoteFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setDoctorNoteFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            <input id="doctor_note_forms" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setDoctorNoteFile(e.target.files?.[0] || null)} />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full gap-2 h-11"><Send className="h-4 w-4" />{isSubmitting ? "Submitting..." : "Submit Leave Request"}</Button>
        </form>
      </div>

      {/* History */}
      {leaveRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground px-1">Previous Requests</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {leaveRequests.map((req: any) => (
              <Card key={req.id} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{getReasonLabel(req.reason)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(req.leave_start_date), "MMM dd")} – {format(new Date(req.return_date), "MMM dd, yyyy")}
                      </p>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{req.leave_days_amount} day{req.leave_days_amount !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(req.created_at), "MMM dd")}</span>
                  </div>
                  {req.admin_notes && <p className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 border border-border">{req.admin_notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Forms Page ──────────────────────────────────────────

const FormsPage = () => {
  const { userRole } = useAuth();
  const { required: hourlyFormRequired, isPip } = useHourlyFormRequired();
  // Start of day and End of day show only when switched on for one of this user's roles (Dev Centre › Settings).
  const { data: visible } = useFormVisibility();
  const [sodOpen, setSodOpen] = useState(true);
  const [hourlyOpen, setHourlyOpen] = useState(true);
  const [eodOpen, setEodOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const layoutRole: "admin" | "setter" | "client" =
    userRole === "setter" ? "setter" : userRole === "client" ? "client" : "admin";

  return (
    <DashboardLayout role={layoutRole}>
      <PageContainer>
        <PageHeader title="Forms" subtitle="Start of day, end of day feedback, and leave requests" />
        <div>
          {/* Start of Day Section */}
          {visible?.sod && (
          <Collapsible open={sodOpen} onOpenChange={setSodOpen}>
            <div className="border-t border-[var(--line)]">
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex w-full items-center justify-between py-3 text-left">
                  <span className="flex items-center gap-2">
                    <h2 className="font-head text-[15px] font-medium tracking-[-0.01em] group-hover:text-[var(--accent)]">Start of Day Form</h2>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[var(--dim)] transition-transform ${sodOpen ? '' : '-rotate-90'}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4">
                <StartOfDaySection />
              </CollapsibleContent>
            </div>
          </Collapsible>
          )}

          {/* Hourly Update Section */}
          {hourlyFormRequired && (
            <Collapsible open={hourlyOpen} onOpenChange={setHourlyOpen}>
              <div className="border-t border-[var(--line)]">
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex w-full items-center justify-between py-3 text-left">
                  <span className="flex items-center gap-2">
                    <h2 className="font-head text-[15px] font-medium tracking-[-0.01em] group-hover:text-[var(--accent)]">Hourly Update Form</h2><Pill variant="warn">{isPip ? 'PIP' : 'Required'}</Pill>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[var(--dim)] transition-transform ${hourlyOpen ? '' : '-rotate-90'}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4">
                <HourlyUpdateSection />
              </CollapsibleContent>
            </div>
            </Collapsible>
          )}

          {/* EOD Section */}
          {visible?.eod && (
          <Collapsible open={eodOpen} onOpenChange={setEodOpen}>
            <div className="border-t border-[var(--line)]">
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex w-full items-center justify-between py-3 text-left">
                  <span className="flex items-center gap-2">
                    <h2 className="font-head text-[15px] font-medium tracking-[-0.01em] group-hover:text-[var(--accent)]">End of Day Form</h2>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[var(--dim)] transition-transform ${eodOpen ? '' : '-rotate-90'}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4">
                <EODSection />
              </CollapsibleContent>
            </div>
          </Collapsible>
          )}

          {/* Leave Section */}
          <Collapsible open={leaveOpen} onOpenChange={setLeaveOpen}>
            <div className="border-t border-[var(--line)]">
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex w-full items-center justify-between py-3 text-left">
                  <span className="flex items-center gap-2">
                    <h2 className="font-head text-[15px] font-medium tracking-[-0.01em] group-hover:text-[var(--accent)]">Employee Leave Form</h2>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[var(--dim)] transition-transform ${leaveOpen ? '' : '-rotate-90'}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4">
                <LeaveSection />
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default FormsPage;
