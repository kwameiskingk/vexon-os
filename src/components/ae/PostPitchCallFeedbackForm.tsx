import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, User, Calendar, Building2 } from "lucide-react";

interface PitchCallInfo {
  id: string;
  client_name: string;
  company_name: string | null;
  pitch_call_date: string;
  pitch_call_time: string | null;
  fathom_url: string | null;
}

interface PostPitchCallFeedbackFormProps {
  pitchCall: PitchCallInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PAIN_POINT_OPTIONS = [
  "Lack of time",
  "Lack of expertise",
  "Not interested in BD",
  "Other",
];

const DECISION_PROCESS_OPTIONS = [
  "Sole decision maker",
  "Needs partner / co-founder approval",
  "Needs board / investor approval",
  "Other",
];

export function PostPitchCallFeedbackForm({
  pitchCall,
  open,
  onOpenChange,
  onSuccess,
}: PostPitchCallFeedbackFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [callRecordingLink, setCallRecordingLink] = useState("");
  const [likelihoodToClose, setLikelihoodToClose] = useState(5);
  const [painPoints, setPainPoints] = useState<string[]>([]);
  const [painPointsOther, setPainPointsOther] = useState("");
  const [decisionProcess, setDecisionProcess] = useState("");
  const [decisionProcessOther, setDecisionProcessOther] = useState("");
  const [notes, setNotes] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return { ...data, id: user.id };
    },
  });

  const resetForm = () => {
    setCallRecordingLink("");
    setLikelihoodToClose(5);
    setPainPoints([]);
    setPainPointsOther("");
    setDecisionProcess("");
    setDecisionProcessOther("");
    setNotes("");
  };

  const togglePainPoint = (value: string) => {
    setPainPoints((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSubmit = async () => {
    if (!pitchCall || !profile?.id) return;

    if (!callRecordingLink.trim()) {
      toast.error("Please provide the call recording link");
      return;
    }

    const painPointsFinal = painPoints
      .map((p) => (p === "Other" && painPointsOther.trim() ? `Other: ${painPointsOther.trim()}` : p))
      .join(", ");

    const decisionProcessFinal =
      decisionProcess === "Other" && decisionProcessOther.trim()
        ? `Other: ${decisionProcessOther.trim()}`
        : decisionProcess;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("post_pitch_call_feedback" as any)
        .insert({
          pitch_call_id: pitchCall.id,
          ae_user_id: profile.id,
          client_name: pitchCall.client_name,
          company_name: pitchCall.company_name,
          call_date: pitchCall.pitch_call_date,
          call_recording_link: callRecordingLink.trim(),
          closing_confidence_score: likelihoodToClose,
          summary: notes.trim() || "—",
          objections_raised: painPointsFinal || "—",
          next_steps_agreed: decisionProcessFinal,
        } as any);

      if (error) throw error;

      await supabase
        .from("pitch_calls")
        .update({ has_feedback: true } as any)
        .eq("id", pitchCall.id);

      toast.success("Follow-up call feedback submitted");
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      toast.error(error.message || "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) onOpenChange(o); /* block close attempts */ }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Post Follow-Up Call Feedback</DialogTitle>
          <DialogDescription>
            Feedback is required for every follow-up call — this form cannot be dismissed until you submit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="font-medium text-sm">{pitchCall?.company_name || pitchCall?.client_name || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">AE</p>
                  <p className="font-medium text-sm">{profile?.full_name || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium text-sm">
                    {pitchCall?.pitch_call_date
                      ? format(new Date(pitchCall.pitch_call_date), "MMM d, yyyy")
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="pc-recording-link">Call Recording Link *</Label>
            <Input
              id="pc-recording-link"
              placeholder="https://fathom.video/..."
              value={callRecordingLink || pitchCall?.fathom_url || ""}
              onChange={(e) => setCallRecordingLink(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">How likely is this to close?</Label>
              <Badge variant="outline" className="font-mono">{likelihoodToClose}/10</Badge>
            </div>
            <Slider
              value={[likelihoodToClose]}
              onValueChange={(v) => setLikelihoodToClose(v[0])}
              min={1}
              max={10}
              step={1}
              className="py-2"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Key Pain Points</Label>
            <div className="space-y-2">
              {PAIN_POINT_OPTIONS.map((option) => (
                <div key={option} className="flex items-center gap-2">
                  <Checkbox
                    id={`pc-pp-${option}`}
                    checked={painPoints.includes(option)}
                    onCheckedChange={() => togglePainPoint(option)}
                  />
                  <Label htmlFor={`pc-pp-${option}`} className="font-normal cursor-pointer">{option}</Label>
                </div>
              ))}
              {painPoints.includes("Other") && (
                <Input
                  placeholder="Describe the other pain point"
                  value={painPointsOther}
                  onChange={(e) => setPainPointsOther(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Decision Process</Label>
            <RadioGroup value={decisionProcess} onValueChange={setDecisionProcess}>
              {DECISION_PROCESS_OPTIONS.map((option) => (
                <div key={option} className="flex items-center gap-2">
                  <RadioGroupItem value={option} id={`pc-dp-${option}`} />
                  <Label htmlFor={`pc-dp-${option}`} className="font-normal cursor-pointer">{option}</Label>
                </div>
              ))}
            </RadioGroup>
            {decisionProcess === "Other" && (
              <Input
                placeholder="Describe the decision process"
                value={decisionProcessOther}
                onChange={(e) => setDecisionProcessOther(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-notes">Additional Notes</Label>
            <Textarea
              id="pc-notes"
              placeholder="Anything else worth capturing?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
