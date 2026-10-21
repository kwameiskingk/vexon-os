import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Star, Building2, User, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";

interface PendingFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onSuccess: () => void;
}

const DECLINE_REASONS = [
  "Prospect didn't show up",
  "Prospect cancelled last minute",
  "Not a qualified opportunity",
  "Wrong contact / decision maker",
  "Bad timing for prospect",
  "Technical issues",
  "Other",
];

export function PendingFeedbackModal({ open, onOpenChange, meeting, onSuccess }: PendingFeedbackModalProps) {
  const [sat, setSat] = useState<"yes" | "no" | "">("");
  const [declineReason, setDeclineReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [termsSent, setTermsSent] = useState(false);
  const [followupBooked, setFollowupBooked] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!meeting) return null;

  const reset = () => {
    setSat(""); setDeclineReason(""); setOtherReason("");
    setTermsSent(false); setFollowupBooked(false); setRating(0); setComments("");
  };

  const handleSubmit = async () => {
    if (!sat) { toast.error("Please indicate whether the meeting was sat"); return; }
    if (sat === "no" && !declineReason) { toast.error("Please select a reason"); return; }
    if (sat === "no" && declineReason === "Other" && !otherReason.trim()) {
      toast.error("Please describe the reason"); return;
    }

    setSubmitting(true);

    const update: any = {
      client_feedback_sat: sat === "yes",
      client_feedback_submitted_at: new Date().toISOString(),
      client_feedback_comments: comments || null,
    };

    if (sat === "yes") {
      update.attendance_status = "sat";
      update.client_feedback_terms_sent = termsSent;
      update.client_feedback_followup_booked = followupBooked;
      update.client_feedback_rating = rating || null;
    } else {
      update.status = "client_rejected";
      update.client_feedback_decline_reason =
        declineReason === "Other" ? otherReason.trim() : declineReason;
    }

    const { error } = await supabase.from("meetings").update(update).eq("id", meeting.id);
    setSubmitting(false);

    if (error) { toast.error(error.message); return; }
    toast.success("Feedback submitted");
    reset();
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Meeting Feedback
          </DialogTitle>
          <DialogDescription>
            Let us know how the meeting went so we can keep your campaign on track.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
          <div className="font-semibold">{meeting.company_name}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{meeting.prospect_name}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(meeting.meeting_date), "dd MMM yyyy")}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{meeting.meeting_time?.slice(0, 5)}</span>
          </div>
        </div>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Did the meeting take place?</Label>
            <RadioGroup value={sat} onValueChange={(v) => setSat(v as any)} className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${sat === "yes" ? "border-green-500 bg-green-500/10" : "border-border hover:border-muted-foreground/50"}`}>
                <RadioGroupItem value="yes" />
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Yes, it sat</span>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${sat === "no" ? "border-red-500 bg-red-500/10" : "border-border hover:border-muted-foreground/50"}`}>
                <RadioGroupItem value="no" />
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">No, it didn't</span>
              </label>
            </RadioGroup>
          </div>

          {sat === "yes" && (
            <div className="space-y-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="flex items-center justify-between">
                <Label htmlFor="terms" className="text-sm font-medium">Terms sent?</Label>
                <Checkbox id="terms" checked={termsSent} onCheckedChange={(c) => setTermsSent(!!c)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="followup" className="text-sm font-medium">Follow-up booked?</Label>
                <Checkbox id="followup" checked={followupBooked} onCheckedChange={(c) => setFollowupBooked(!!c)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lead quality</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className="p-1">
                      <Star className={`h-6 w-6 transition-colors ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {sat === "no" && (
            <div className="space-y-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
              <Label className="text-sm font-medium">What happened?</Label>
              <RadioGroup value={declineReason} onValueChange={setDeclineReason} className="space-y-1.5">
                {DECLINE_REASONS.map((r) => (
                  <label key={r} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${declineReason === r ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}>
                    <RadioGroupItem value={r} />
                    <span>{r}</span>
                  </label>
                ))}
              </RadioGroup>
              {declineReason === "Other" && (
                <Textarea placeholder="Please describe..." value={otherReason} onChange={(e) => setOtherReason(e.target.value)} rows={2} />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="comments" className="text-sm font-medium">Additional comments (optional)</Label>
            <Textarea id="comments" placeholder="Anything else we should know?" value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
