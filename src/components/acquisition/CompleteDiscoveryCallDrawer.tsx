import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { Loader2, Calendar, User, Building, Mail, Phone, Globe, Link as LinkIcon, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StatusData } from "./AcquisitionStatusModal";

interface Meeting {
  id: string;
  company_name: string;
  prospect_name: string;
  prospect_email: string;
  prospect_mobile: string | null;
  prospect_linkedin: string | null;
  company_website: string | null;
  meeting_date: string;
  meeting_time: string;
  status: string | null;
  notes: string | null;
  setter_profile?: {
    full_name: string | null;
    email: string;
  } | null;
}

interface CompleteDiscoveryCallDrawerProps {
  meeting: Meeting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    meeting_id: string;
    meeting_status: string;
    attendance_confirmed: boolean;
    /** Retained in the signature for back-compat; always false now (UI removed). */
    team_network_member: boolean;
    contract_value: number | null;
    contract_term: string | null;
    statusData: StatusData;
    feedback: FeedbackData | null;
  }) => Promise<void>;
  isSaving: boolean;
  statusData?: StatusData;
}

// Kept compatible with `post_discovery_feedback` table — irrelevant fields stay empty.
interface FeedbackData {
  call_recording_link: string;
  call_type: "discovery" | "follow_up";
  icp_fit_score: number; // repurposed UI-side as "How likely to close (1-10)"
  pain_severity_score: number;
  urgency_score: number;
  budget_confidence_score: number;
  decision_maker_access_score: number;
  summary: string;
  key_pain_points: string;
  desired_outcome: string;
  decision_process: string;
  objections_raised: string;
  risks_to_close: string;
  next_steps_agreed: string;
  ae_what_went_well: string;
  ae_what_to_improve: string;
  support_needed_from_ceo: string;
}

const PAIN_OPTIONS = [
  { id: "lack_of_time", label: "Lack of time" },
  { id: "lack_of_expertise", label: "Lack of expertise" },
  { id: "not_interested_in_bd", label: "Not interested in BD" },
] as const;

const DECISION_OPTIONS = [
  { id: "primary", label: "Primary decision maker" },
  { id: "not_primary", label: "Not primary decision maker" },
] as const;

const isSatStatus = (status: string) => status === "sat_follow_up" || status === "sat_no_follow_up";
const isFollowUpSat = (status: string) => status === "sat_follow_up";

const getStatusLabel = (status: string) => {
  switch (status) {
    case "sat_follow_up": return "Sat - Follow Up Booked";
    case "sat_no_follow_up": return "Sat - No Follow Up Booked";
    case "rescheduled": return "Rescheduled";
    case "cancelled": return "Cancelled";
    case "no_show": return "No Show";
    default: return status;
  }
};

export function CompleteDiscoveryCallDrawer({
  meeting,
  open,
  onOpenChange,
  onSave,
  isSaving,
  statusData,
}: CompleteDiscoveryCallDrawerProps) {
  const [page, setPage] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({
    contract_value: "",
    contract_term: "",
  });

  // Simplified feedback state
  const [callRecordingLink, setCallRecordingLink] = useState("");
  const [closeLikelihood, setCloseLikelihood] = useState(5);
  const [likelihoodNote, setLikelihoodNote] = useState("");

  const [painSelections, setPainSelections] = useState<Record<string, boolean>>({});
  const [painOtherChecked, setPainOtherChecked] = useState(false);
  const [painOtherText, setPainOtherText] = useState("");

  const [decisionChoice, setDecisionChoice] = useState<string>("");
  const [decisionOtherText, setDecisionOtherText] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["current-user-profile-drawer"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      return { ...data, id: user.id };
    },
  });

  const resetForm = () => {
    setPage(1);
    setFormData({ contract_value: "", contract_term: "" });
    setCallRecordingLink("");
    setCloseLikelihood(5);
    setLikelihoodNote("");
    setPainSelections({});
    setPainOtherChecked(false);
    setPainOtherText("");
    setDecisionChoice("");
    setDecisionOtherText("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const isSat = statusData ? isSatStatus(statusData.status) : false;
  const needsDealDetails = statusData ? isFollowUpSat(statusData.status) : false;

  const buildPainPoints = (): string => {
    const picks: string[] = PAIN_OPTIONS.filter((o) => painSelections[o.id]).map((o) => o.label);
    if (painOtherChecked && painOtherText.trim()) picks.push(`Other: ${painOtherText.trim()}`);
    return picks.join(", ");
  };

  const buildDecisionProcess = (): string => {
    if (decisionChoice === "other") {
      return decisionOtherText.trim() ? `Other: ${decisionOtherText.trim()}` : "Other";
    }
    const match = DECISION_OPTIONS.find((o) => o.id === decisionChoice);
    return match?.label || "";
  };

  const handleSubmit = async () => {
    if (!meeting || !statusData) return;

    const feedbackData: FeedbackData | null = isSat ? {
      call_recording_link: callRecordingLink.trim(),
      call_type: "discovery",
      icp_fit_score: closeLikelihood,
      pain_severity_score: 0,
      urgency_score: 0,
      budget_confidence_score: 0,
      decision_maker_access_score: 0,
      summary: likelihoodNote.trim(),
      key_pain_points: buildPainPoints(),
      desired_outcome: "",
      decision_process: buildDecisionProcess(),
      objections_raised: "",
      risks_to_close: "",
      next_steps_agreed: "",
      ae_what_went_well: "",
      ae_what_to_improve: "",
      support_needed_from_ceo: "",
    } : null;

    await onSave({
      meeting_id: meeting.id,
      meeting_status: isSat ? "sat" : statusData.status,
      attendance_confirmed: isSat,
      team_network_member: false,
      contract_value: formData.contract_value ? parseFloat(formData.contract_value) : null,
      contract_term: formData.contract_term || null,
      statusData,
      feedback: feedbackData,
    });
  };

  if (!meeting || !statusData) return null;

  const lockDialog = page === 2; // feedback page cannot be dismissed until submit

  return (
    <Dialog open={open} onOpenChange={(o) => { if (lockDialog && !o) return; handleOpenChange(o); }}>
      <DialogContent
        className="sm:max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-0"
        onEscapeKeyDown={(e) => lockDialog && e.preventDefault()}
        onPointerDownOutside={(e) => lockDialog && e.preventDefault()}
        onInteractOutside={(e) => lockDialog && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>
            {page === 1 ? "Complete Discovery Call" : "Post Discovery Feedback"}
          </DialogTitle>
          <DialogDescription>
            {page === 1
              ? "Record the outcome for this discovery call"
              : "Feedback is required — this form cannot be dismissed until you submit."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {page === 1 ? (
            <div className="space-y-6 pt-2">
              {/* Meeting Details */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meeting Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{meeting.company_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{meeting.prospect_name}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{meeting.prospect_email}</span>
                  </div>
                  {meeting.prospect_mobile && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{meeting.prospect_mobile}</span>
                    </div>
                  )}
                  {meeting.company_website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={meeting.company_website.startsWith("http") ? meeting.company_website : `https://${meeting.company_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate"
                      >
                        {meeting.company_website}
                      </a>
                    </div>
                  )}
                  {meeting.prospect_linkedin && (
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <a href={meeting.prospect_linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">LinkedIn Profile</a>
                    </div>
                  )}
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{format(new Date(meeting.meeting_date), "PPP")} at {meeting.meeting_time}</span>
                  </div>
                  {meeting.setter_profile && (
                    <div className="pt-2 border-t border-border sm:col-span-2">
                      <span className="text-xs text-muted-foreground">
                        Logged by: {meeting.setter_profile.full_name || meeting.setter_profile.email}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 1: Meeting Status */}
              <div className="space-y-3 p-4 bg-muted/20 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 1: Meeting Status</h3>
                <div className="flex items-center gap-2">
                  <Badge className={
                    isSat ? "bg-green-500/20 text-green-400 border-green-500/30" :
                    statusData.status === "rescheduled" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                    statusData.status === "cancelled" ? "bg-muted text-muted-foreground border-border" :
                    "bg-red-500/20 text-red-400 border-red-500/30"
                  }>
                    {getStatusLabel(statusData.status)}
                  </Badge>
                </div>

                {statusData.status === "sat_follow_up" && statusData.follow_up_date && (
                  <div className="text-sm text-muted-foreground">
                    Follow-up: {statusData.follow_up_date} at {statusData.follow_up_time}
                  </div>
                )}
                {statusData.no_follow_up_note && (
                  <div className="text-sm text-muted-foreground">
                    Note: {statusData.no_follow_up_note}
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox id="attendance" checked={isSat} disabled />
                  <Label htmlFor="attendance">Attendance Confirmed</Label>
                </div>
              </div>

              {/* Step 2: Contract details (only when sat + follow-up booked) */}
              {needsDealDetails && (
                <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Step 2: Deal Details</h3>

                  <div>
                    <Label>Contract Value (£)</Label>
                    <Input
                      type="number"
                      value={formData.contract_value}
                      onChange={(e) => setFormData({ ...formData, contract_value: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label>Contract Term</Label>
                    <Select
                      value={formData.contract_term}
                      onValueChange={(value) => setFormData({ ...formData, contract_term: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3 months">3 months</SelectItem>
                        <SelectItem value="6 months">6 months</SelectItem>
                        <SelectItem value="12 months">12 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Page 2: Simplified Post-Discovery Feedback */
            <div className="space-y-6 pt-2">
              {/* Call info */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Call Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium text-sm">{meeting.company_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">AE</p>
                    <p className="font-medium text-sm">{profile?.full_name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium text-sm">
                      {format(new Date(meeting.meeting_date), "MMM d, yyyy")} {meeting.meeting_time}
                    </p>
                  </div>
                </div>
              </div>

              {/* Call recording (optional) */}
              <div className="space-y-2">
                <Label>Call Recording Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder="https://fathom.video/..."
                  value={callRecordingLink}
                  onChange={(e) => setCallRecordingLink(e.target.value)}
                />
              </div>

              {/* Close likelihood */}
              <div className="space-y-3 p-4 bg-muted/20 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">How likely do you think this is to close?</Label>
                  <Badge variant="outline" className="font-mono">{closeLikelihood}/10</Badge>
                </div>
                <Slider
                  value={[closeLikelihood]}
                  onValueChange={(vals) => setCloseLikelihood(vals[0])}
                  min={1}
                  max={10}
                  step={1}
                  className="py-2"
                />
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Reasoning <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="Why did you give that score?"
                    value={likelihoodNote}
                    onChange={(e) => setLikelihoodNote(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <Separator />

              {/* Key Pain Points */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Key Pain Points</Label>
                <div className="space-y-2">
                  {PAIN_OPTIONS.map((opt) => (
                    <div key={opt.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pain-${opt.id}`}
                        checked={!!painSelections[opt.id]}
                        onCheckedChange={(checked) =>
                          setPainSelections((prev) => ({ ...prev, [opt.id]: !!checked }))
                        }
                      />
                      <Label htmlFor={`pain-${opt.id}`} className="font-normal cursor-pointer">{opt.label}</Label>
                    </div>
                  ))}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pain-other"
                      checked={painOtherChecked}
                      onCheckedChange={(checked) => setPainOtherChecked(!!checked)}
                    />
                    <Label htmlFor="pain-other" className="font-normal cursor-pointer">Other</Label>
                  </div>
                  {painOtherChecked && (
                    <Textarea
                      placeholder="Describe the other pain point..."
                      value={painOtherText}
                      onChange={(e) => setPainOtherText(e.target.value)}
                      rows={2}
                      className="ml-6"
                    />
                  )}
                </div>
              </div>

              <Separator />

              {/* Decision Process */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Decision Process</Label>
                <div className="space-y-2">
                  {DECISION_OPTIONS.map((opt) => (
                    <div key={opt.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dec-${opt.id}`}
                        checked={decisionChoice === opt.id}
                        onCheckedChange={(checked) =>
                          setDecisionChoice(checked ? opt.id : "")
                        }
                      />
                      <Label htmlFor={`dec-${opt.id}`} className="font-normal cursor-pointer">{opt.label}</Label>
                    </div>
                  ))}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dec-other"
                      checked={decisionChoice === "other"}
                      onCheckedChange={(checked) => setDecisionChoice(checked ? "other" : "")}
                    />
                    <Label htmlFor="dec-other" className="font-normal cursor-pointer">Other</Label>
                  </div>
                  {decisionChoice === "other" && (
                    <Textarea
                      placeholder="Who actually makes the decision?"
                      value={decisionOtherText}
                      onChange={(e) => setDecisionOtherText(e.target.value)}
                      rows={2}
                      className="ml-6"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t bg-background">
          {page === 2 && (
            <Button type="button" variant="outline" onClick={() => setPage(1)} disabled={isSaving}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {page === 1 && (
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving} className="flex-1">
              Cancel
            </Button>
          )}
          {page === 1 && isSat ? (
            <Button onClick={() => setPage(2)} className="flex-1">
              Next Page
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Outcome"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
