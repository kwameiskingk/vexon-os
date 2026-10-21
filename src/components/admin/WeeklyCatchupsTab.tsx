import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Video, CheckCircle2, Trash2, Edit2, ExternalLink, Loader2, Smile, Frown } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { toast } from "sonner";

interface WeeklyCatchupsTabProps {
  clientId: string;
}

interface Catchup {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  summary: string | null;
  action_points: string[];
  fathom_link: string | null;
  status: string;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  vacancies_open?: number | null;
  potential_revenue_total?: number | null;
  opportunities?: number | null;
  testimonial_agreed?: boolean | null;
  csm_happy?: boolean | null;
  csm_happy_note?: string | null;
}

export const WeeklyCatchupsTab = ({ clientId }: WeeklyCatchupsTabProps) => {
  const [catchups, setCatchups] = useState<Catchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Schedule form (date & time only)
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formTime, setFormTime] = useState("10:00");

  // Complete/Edit form
  const [formSummary, setFormSummary] = useState("");
  const [formActionPoints, setFormActionPoints] = useState("");
  const [formFathomLink, setFormFathomLink] = useState("");
  // Client feedback (feeds CEO vacancy / potential-revenue tiles)
  const [formVacancies, setFormVacancies] = useState("");
  const [formRevenueTotal, setFormRevenueTotal] = useState("");
  const [formOpportunities, setFormOpportunities] = useState("");
  // Testimonial agreement flag (complete flow only) — never writes to the
  // testimonials table; collection is recorded solely via Log Testimonial
  const [testimonialAgreed, setTestimonialAgreed] = useState(false);
  // CSM happiness (required to complete) — the subjective half of the dual
  // score; displayed beside the metric score, never blended with it
  const [csmHappy, setCsmHappy] = useState<boolean | null>(null);
  const [csmHappyNote, setCsmHappyNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCatchups();
  }, [clientId]);

  const loadCatchups = async () => {
    try {
      const { data, error } = await supabase
        .from("client_catchups" as any)
        .select("*")
        .eq("client_profile_id", clientId)
        .order("scheduled_date", { ascending: false });

      if (error) throw error;
      setCatchups((data as any[]) || []);
    } catch (error: any) {
      toast.error("Failed to load catch-ups");
    } finally {
      setLoading(false);
    }
  };

  const resetScheduleForm = () => {
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormTime("10:00");
  };

  const resetCompleteForm = () => {
    setFormSummary("");
    setFormActionPoints("");
    setFormFathomLink("");
    setFormVacancies("");
    setFormRevenueTotal("");
    setFormOpportunities("");
    setTestimonialAgreed(false);
    setCsmHappy(null);
    setCsmHappyNote("");
    setEditingId(null);
  };

  // Feedback fields live in columns added after this component shipped —
  // written in a separate update so a not-yet-migrated DB degrades to the
  // legacy completion flow instead of failing it outright.
  const saveFeedbackFields = async (catchupId: string) => {
    const hasFeedback =
      formVacancies !== "" || formRevenueTotal !== "" || formOpportunities !== "";
    if (!hasFeedback) return;
    const { error } = await supabase
      .from("client_catchups")
      .update({
        vacancies_open: formVacancies === "" ? null : Number(formVacancies),
        potential_revenue_total:
          formRevenueTotal === "" ? null : Number(formRevenueTotal),
        opportunities: formOpportunities === "" ? null : Number(formOpportunities),
      })
      .eq("id", catchupId);
    if (error) {
      toast.warning("Catch-up saved, but client feedback fields could not be stored");
    }
  };

  const saveTestimonialAgreed = async (catchupId: string) => {
    if (!testimonialAgreed) return;
    const { error } = await supabase
      .from("client_catchups")
      .update({ testimonial_agreed: true })
      .eq("id", catchupId);
    if (error) {
      toast.warning("Catch-up saved, but the testimonial flag could not be stored");
    }
  };

  // Writes the per-catchup assessment plus the standing copy on the client.
  // Same not-yet-migrated degradation pattern as the feedback fields.
  const saveHappiness = async (catchupId: string) => {
    if (csmHappy === null) return;
    const note = csmHappyNote.trim() || null;
    const { error: catchupError } = await supabase
      .from("client_catchups")
      .update({ csm_happy: csmHappy, csm_happy_note: note })
      .eq("id", catchupId);
    const { error: profileError } = await supabase
      .from("client_profiles")
      .update({
        csm_happy: csmHappy,
        csm_happy_note: note,
        csm_happy_assessed_at: new Date().toISOString(),
      } as never)
      .eq("id", clientId);
    if (catchupError || profileError) {
      toast.warning("Catch-up saved, but the happiness score could not be stored");
    }
  };

  const handleSchedule = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("client_catchups" as any)
        .insert({
          client_profile_id: clientId,
          scheduled_date: formDate,
          scheduled_time: formTime,
          created_by: user.id,
          status: "scheduled",
        } as any);

      if (error) throw error;

      toast.success("Weekly catch-up scheduled");
      setScheduleOpen(false);
      resetScheduleForm();
      loadCatchups();
    } catch (error: any) {
      toast.error(error.message || "Failed to schedule catch-up");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!editingId) return;
    if (csmHappy === null) {
      toast.error("Answer the client happiness question to complete the catch-up");
      return;
    }
    setSaving(true);
    try {
      const actionPointsArray = formActionPoints
        .split("\n")
        .map(ap => ap.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("client_catchups" as any)
        .update({
          summary: formSummary || null,
          action_points: actionPointsArray,
          fathom_link: formFathomLink || null,
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", editingId);

      if (error) throw error;

      await saveFeedbackFields(editingId);
      await saveTestimonialAgreed(editingId);
      await saveHappiness(editingId);

      toast.success("Catch-up completed");
      setCompleteOpen(false);
      resetCompleteForm();
      loadCatchups();
    } catch (error: any) {
      toast.error(error.message || "Failed to complete catch-up");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCompleted = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const actionPointsArray = formActionPoints
        .split("\n")
        .map(ap => ap.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("client_catchups" as any)
        .update({
          summary: formSummary || null,
          action_points: actionPointsArray,
          fathom_link: formFathomLink || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", editingId);

      if (error) throw error;

      await saveFeedbackFields(editingId);
      await saveHappiness(editingId);

      toast.success("Catch-up updated");
      setCompleteOpen(false);
      resetCompleteForm();
      loadCatchups();
    } catch (error: any) {
      toast.error(error.message || "Failed to update catch-up");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (catchupId: string) => {
    if (!confirm("Delete this catch-up?")) return;
    try {
      const { error } = await supabase
        .from("client_catchups" as any)
        .delete()
        .eq("id", catchupId);

      if (error) throw error;
      toast.success("Catch-up deleted");
      loadCatchups();
    } catch (error: any) {
      toast.error("Failed to delete catch-up");
    }
  };

  const openCompleteDialog = (catchup: Catchup) => {
    setEditingId(catchup.id);
    setFormSummary(catchup.summary || "");
    setFormActionPoints((catchup.action_points || []).join("\n"));
    setFormFathomLink(catchup.fathom_link || "");
    setFormVacancies(catchup.vacancies_open == null ? "" : String(catchup.vacancies_open));
    setFormRevenueTotal(
      catchup.potential_revenue_total == null ? "" : String(catchup.potential_revenue_total),
    );
    setFormOpportunities(catchup.opportunities == null ? "" : String(catchup.opportunities));
    setTestimonialAgreed(catchup.testimonial_agreed === true);
    setCsmHappy(catchup.csm_happy ?? null);
    setCsmHappyNote(catchup.csm_happy_note || "");
    setCompleteOpen(true);
  };

  const getStatusBadge = (catchup: Catchup) => {
    if (catchup.status === "completed") {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Completed</Badge>;
    }
    if (catchup.status === "cancelled") {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    const scheduledDate = new Date(catchup.scheduled_date);
    if (isToday(scheduledDate)) {
      return <Badge className="bg-primary/10 text-primary border-primary/30">Today</Badge>;
    }
    if (isPast(scheduledDate)) {
      return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Overdue</Badge>;
    }
    return <Badge variant="outline">Upcoming</Badge>;
  };

  const upcoming = catchups.filter(c => c.status === "scheduled");
  const past = catchups.filter(c => c.status !== "scheduled");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Weekly Catch-ups</h2>
          <p className="text-sm text-muted-foreground">
            Schedule and document weekly client meetings with summaries, action points, and recordings.
          </p>
        </div>

        {/* Schedule Dialog - Date & Time only */}
        <Dialog open={scheduleOpen} onOpenChange={(open) => { setScheduleOpen(open); if (!open) resetScheduleForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Catch-up
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Weekly Catch-up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The client will be notified 2 days, 1 day, on the day, and 1 hour before the scheduled catch-up.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setScheduleOpen(false); resetScheduleForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleSchedule} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Schedule
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Complete / Edit Dialog - Summary, Action Points, Fathom Link */}
      <Dialog open={completeOpen} onOpenChange={(open) => { setCompleteOpen(open); if (!open) resetCompleteForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {catchups.find(c => c.id === editingId)?.status === "completed"
                ? "Edit Catch-up Details"
                : "Complete Weekly Catch-up"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea
                placeholder="Brief summary of what was discussed..."
                value={formSummary}
                onChange={(e) => setFormSummary(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Action Points</Label>
              <Textarea
                placeholder="One action point per line..."
                value={formActionPoints}
                onChange={(e) => setFormActionPoints(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Enter each action point on a new line</p>
            </div>
            <div className="space-y-2">
              <Label>Fathom Recording Link</Label>
              <Input
                placeholder="https://fathom.video/..."
                value={formFathomLink}
                onChange={(e) => setFormFathomLink(e.target.value)}
              />
            </div>

            {/* Client feedback — feeds the CEO vacancy / potential-revenue tiles */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 shadow-soft">
              <p className="text-sm font-semibold">Client feedback</p>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Open vacancies</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 3"
                    value={formVacancies}
                    onChange={(e) => setFormVacancies(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Potential revenue to date (£)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 70000"
                    value={formRevenueTotal}
                    onChange={(e) => setFormRevenueTotal(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Opportunities</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 2"
                    value={formOpportunities}
                    onChange={(e) => setFormOpportunities(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                All three are current totals, not this week's additions. Vacancies / opportunities =
                open at this client right now. Potential revenue = the client's running total to date
                — the same cumulative figure you'd have put in the sheet. Each entry overwrites the
                previous value; never enter just this week's amount.
              </p>
            </div>

            {/* CSM happiness — required; the subjective half of the dual score */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 shadow-soft">
              <div>
                <p className="text-sm font-semibold">
                  Client happiness <span className="text-destructive">*</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From your perspective, how happy is the client?
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={csmHappy === true ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setCsmHappy(true)}
                >
                  <Smile className="h-4 w-4" />
                  Happy
                </Button>
                <Button
                  type="button"
                  variant={csmHappy === false ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setCsmHappy(false)}
                >
                  <Frown className="h-4 w-4" />
                  Not happy
                </Button>
              </div>
              <Textarea
                placeholder="Reasoning (optional)…"
                value={csmHappyNote}
                onChange={(e) => setCsmHappyNote(e.target.value)}
                rows={2}
              />
            </div>

            {/* Testimonial agreement — flag only, never inserts into testimonials */}
            {catchups.find(c => c.id === editingId)?.status !== "completed" && (
              <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 shadow-soft">
                <p className="text-sm font-semibold">Testimonial</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="testimonial-agreed"
                    checked={testimonialAgreed}
                    onCheckedChange={(v) => setTestimonialAgreed(v === true)}
                  />
                  <Label htmlFor="testimonial-agreed" className="text-sm font-normal">
                    Client agreed to give a testimonial (coming up)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is a flag only — it does not count on the dashboard. When the
                  testimonial is actually in hand, record it with Log Testimonial; that's
                  the only place a collected testimonial is counted.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setCompleteOpen(false); resetCompleteForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={
                  catchups.find(c => c.id === editingId)?.status === "completed"
                    ? handleUpdateCompleted
                    : handleComplete
                }
                disabled={
                  saving ||
                  (catchups.find(c => c.id === editingId)?.status !== "completed" &&
                    csmHappy === null)
                }
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {catchups.find(c => c.id === editingId)?.status === "completed"
                  ? "Update"
                  : "Complete Catch-up"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upcoming Catch-ups */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</h3>
          {upcoming.map(catchup => (
            <Card key={catchup.id} className="border-border shadow-card">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <Video className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {format(new Date(catchup.scheduled_date), "EEEE, MMMM do, yyyy")}
                        </span>
                        <span className="text-muted-foreground">at {catchup.scheduled_time?.slice(0, 5)}</span>
                        {getStatusBadge(catchup)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-green-500 hover:text-green-600" onClick={() => openCompleteDialog(catchup)}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs">Complete</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(catchup.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Past / Completed Catch-ups */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">History</h3>
          {past.map(catchup => (
            <Card key={catchup.id} className="border-border shadow-card opacity-80">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center mt-0.5">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {format(new Date(catchup.scheduled_date), "EEEE, MMMM do, yyyy")}
                        </span>
                        <span className="text-muted-foreground">at {catchup.scheduled_time?.slice(0, 5)}</span>
                        {getStatusBadge(catchup)}
                      </div>
                      {catchup.summary && (
                        <p className="text-sm text-muted-foreground">{catchup.summary}</p>
                      )}
                      {catchup.action_points?.length > 0 && (
                        <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                          {catchup.action_points.map((ap, i) => (
                            <li key={i}>{ap}</li>
                          ))}
                        </ul>
                      )}
                      {catchup.fathom_link && (
                        <a href={catchup.fathom_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Fathom Recording
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCompleteDialog(catchup)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(catchup.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {catchups.length === 0 && (
        <Card className="border-border shadow-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No weekly catch-ups scheduled</p>
            <p className="text-sm mt-1">Schedule your first catch-up to start tracking client meetings.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
