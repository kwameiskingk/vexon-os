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

interface DiscoveryLog {
  id: string;
  client_name: string;
  meeting_at: string;
}

interface PostDiscoveryFeedbackFormProps {
  discoveryLog: DiscoveryLog | null;
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

export function PostDiscoveryFeedbackForm({
  discoveryLog,
  open,
  onOpenChange,
  onSuccess,
}: PostDiscoveryFeedbackFormProps) {
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
    if (!discoveryLog || !profile?.id) return;

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
        .from("post_discovery_feedback")
        .insert({
          discovery_log_id: discoveryLog.id,
          ae_user_id: profile.id,
          client_name: discoveryLog.client_name,
          call_date: discoveryLog.meeting_at,
          call_recording_link: callRecordingLink.trim(),
          call_type: "discovery",
          icp_fit_score: likelihoodToClose,
          pain_severity_score: 5,
          urgency_score: 5,
          budget_confidence_score: 5,
          decision_maker_access_score: 5,
          summary: notes.trim() || "—",
          key_pain_points: painPointsFinal || "—",
          decision_process: decisionProcessFinal || "—",
          desired_outcome: "",
          objections_raised: "",
          risks_to_close: "",
          next_steps_agreed: "",
          ae_what_went_well: "",
          ae_what_to_improve: "",
          support_needed_from_ceo: "",
        });

      if (error) throw error;

      toast.success("Post Discovery feedback submitted");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post Discovery Feedback</DialogTitle>
          <DialogDescription>
            Quick feedback for this discovery call
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Auto-filled info */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="font-medium text-sm">{discoveryLog?.client_name || "-"}</p>
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
                    {discoveryLog?.meeting_at
                      ? format(new Date(discoveryLog.meeting_at), "MMM d, yyyy HH:mm")
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Recording */}
          <div className="space-y-2">
            <Label htmlFor="recording-link">Call Recording Link *</Label>
            <Input
              id="recording-link"
              placeholder="https://fathom.video/..."
              value={callRecordingLink}
              onChange={(e) => setCallRecordingLink(e.target.value)}
            />
          </div>

          {/* Likelihood */}
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

          {/* Pain points */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Key Pain Points</Label>
            <div className="space-y-2">
              {PAIN_POINT_OPTIONS.map((option) => (
                <div key={option} className="flex items-center gap-2">
                  <Checkbox
                    id={`pp-${option}`}
                    checked={painPoints.includes(option)}
                    onCheckedChange={() => togglePainPoint(option)}
                  />
                  <Label htmlFor={`pp-${option}`} className="font-normal cursor-pointer">{option}</Label>
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

          {/* Decision process */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Decision Process</Label>
            <RadioGroup value={decisionProcess} onValueChange={setDecisionProcess}>
              {DECISION_PROCESS_OPTIONS.map((option) => (
                <div key={option} className="flex items-center gap-2">
                  <RadioGroupItem value={option} id={`dp-${option}`} />
                  <Label htmlFor={`dp-${option}`} className="font-normal cursor-pointer">{option}</Label>
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Anything else worth capturing?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
