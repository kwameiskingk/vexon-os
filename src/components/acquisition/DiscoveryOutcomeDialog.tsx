// Discovery outcome in TWO steps (Marcus, 18 Sep 2026): click a meeting →
// land straight on the outcome. Step 1 = what happened (status + the details
// that status needs + deal value). Step 2 (sat calls only) = the debrief:
// recording, close likelihood, pain points (free text Marcus fills every
// time), sector (auto from Close, editable), decision process, and
// "Is this a reference?" → the prospect's details go to a partner.
// In-app follow-up booking is gone from this flow (Marcus books with his
// link); the old AcquisitionStatusModal + CompleteDiscoveryCallDrawer stay
// in the repo for the admin Acquisition Meetings page.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Ban, CalendarCheck, CalendarX, Copy, ExternalLink, Loader2, PhoneOff, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFollowUpEventFor } from "@/hooks/useBookingEvent";
import type { StatusData } from "./AcquisitionStatusModal";

export interface OutcomeSaveData {
  meeting_id: string;
  meeting_status: string;
  attendance_confirmed: boolean;
  team_network_member: boolean;
  contract_value: number | null;
  contract_term: string | null;
  statusData: StatusData;
  feedback: Record<string, unknown> | null;
  /** New (18 Sep): written to meetings.sector / meetings.pain_points. */
  sector: string | null;
  pain_points: string | null;
  /** New (18 Sep): create a partner reference with the prospect's details. */
  reference: { partner_id: string; note: string } | null;
}

export interface OutcomeMeeting {
  id: string;
  company_name: string;
  prospect_name: string | null;
  prospect_email: string | null;
  prospect_mobile?: string | null;
  prospect_linkedin?: string | null;
  meeting_date: string;
  meeting_time: string;
  close_lead_link?: string | null;
  assigned_ae_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: OutcomeMeeting | null;
  onSave: (data: OutcomeSaveData) => Promise<void>;
  isSaving: boolean;
  initialStatus?: string;
  onShowDetails?: () => void;
}

const PAIN_OPTIONS = [
  { id: "lack_of_time", label: "Lack of time for BD" },
  { id: "lack_of_expertise", label: "Lack of BD expertise" },
  { id: "not_interested_in_bd", label: "Doesn't enjoy BD" },
];
const DECISION_OPTIONS = [
  { id: "primary", label: "They are the decision maker" },
  { id: "not_primary", label: "Someone else decides" },
];
const SAT = new Set(["sat_follow_up", "sat_no_follow_up"]);

export function DiscoveryOutcomeDialog({ open, onOpenChange, meeting, onSave, isSaving, initialStatus, onShowDetails }: Props) {
  const { userRole } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [status, setStatus] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [noFollowUpNote, setNoFollowUpNote] = useState("");
  const [rescheduleMode, setRescheduleMode] = useState<"enter_details" | "assign_setter">("enter_details");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [noShow, setNoShow] = useState<Record<string, "" | "yes" | "no">>({ waiting_email_sent: "", called_prospect: "", informed_setter: "", waited_ten_minutes: "" });
  const [contractValue, setContractValue] = useState("");
  const [contractTerm, setContractTerm] = useState("");
  // Step 2
  const [recording, setRecording] = useState("");
  const [likelihood, setLikelihood] = useState(5);
  const [likelihoodNote, setLikelihoodNote] = useState("");
  const [painPicks, setPainPicks] = useState<Record<string, boolean>>({});
  const [painText, setPainText] = useState("");
  const [decision, setDecision] = useState("");
  const [decisionOther, setDecisionOther] = useState("");
  const [sector, setSector] = useState("");
  const [sectorSource, setSectorSource] = useState<"close" | "manual" | "">("");
  const [isReference, setIsReference] = useState<"" | "yes" | "no">("");
  const [partnerId, setPartnerId] = useState("");
  const [referenceNote, setReferenceNote] = useState("");

  const reset = () => {
    setStep(1); setStatus(""); setFollowUpDate(""); setFollowUpTime(""); setNoFollowUpNote("");
    setRescheduleMode("enter_details"); setRescheduleDate(""); setRescheduleTime(""); setCancelReason("");
    setNoShow({ waiting_email_sent: "", called_prospect: "", informed_setter: "", waited_ten_minutes: "" });
    setContractValue(""); setContractTerm(""); setRecording(""); setLikelihood(5); setLikelihoodNote("");
    setPainPicks({}); setPainText(""); setDecision(""); setDecisionOther(""); setSector(""); setSectorSource("");
    setIsReference(""); setPartnerId(""); setReferenceNote("");
  };
  useEffect(() => { if (open) { reset(); if (initialStatus) setStatus(initialStatus); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, meeting?.id]);

  // Sector: pulled from the Close lead's custom field when the meeting has a link.
  useEffect(() => {
    if (!open || !meeting?.close_lead_link || sector) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("hiring-close-lead", { body: { close_lead_link: meeting.close_lead_link } });
        const answers: Record<string, string> = data?.answers ?? {};
        const key = Object.keys(answers).find((k) => /sector|industry/i.test(k));
        if (!cancelled && key && answers[key]) { setSector(answers[key]); setSectorSource("close"); }
      } catch { /* Close not connected or lead not found — Marcus types it */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting?.close_lead_link]);

  // Copy-link alternative to in-app booking (Marcus uses his link).
  const { data: sessionUserId } = useQuery({ queryKey: ["session-user-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null, staleTime: Infinity });
  const isAdminTier = userRole === "admin" || userRole === "dev";
  const { data: followUpEvent } = useFollowUpEventFor(isAdminTier ? sessionUserId : meeting?.assigned_ae_id || sessionUserId);
  const followUpLink = followUpEvent?.slug ? `${window.location.origin}/bookings/${followUpEvent.slug}` : null;

  const { data: partners = [] } = useQuery({
    queryKey: ["reference-partners"],
    enabled: open && isReference === "yes",
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id, full_name, company_name, email").order("full_name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string; company_name: string | null; email: string }>;
    },
  });

  const isSat = SAT.has(status);
  const step1Ok = useMemo(() => {
    if (!status) return false;
    if (status === "sat_follow_up" && (!followUpDate || !followUpTime)) return false;
    if (status === "sat_no_follow_up" && !noFollowUpNote.trim()) return false;
    if (status === "rescheduled" && rescheduleMode === "enter_details" && (!rescheduleDate || !rescheduleTime)) return false;
    if (status === "cancelled" && !cancelReason.trim()) return false;
    if (status === "no_show" && Object.values(noShow).some((v) => !v)) return false;
    return true;
  }, [status, followUpDate, followUpTime, noFollowUpNote, rescheduleMode, rescheduleDate, rescheduleTime, cancelReason, noShow]);
  const step2Ok = !isSat || (painText.trim().length > 0 && isReference !== "" && (isReference === "no" || !!partnerId));

  const buildStatusData = (): StatusData => ({
    status,
    follow_up_date: status === "sat_follow_up" ? followUpDate : undefined,
    follow_up_time: status === "sat_follow_up" ? followUpTime : undefined,
    reschedule_date: status === "rescheduled" && rescheduleMode === "enter_details" ? rescheduleDate : undefined,
    reschedule_time: status === "rescheduled" && rescheduleMode === "enter_details" ? rescheduleTime : undefined,
    reschedule_mode: status === "rescheduled" ? rescheduleMode : undefined,
    cancel_reason: status === "cancelled" ? cancelReason : undefined,
    no_follow_up_note: status === "sat_no_follow_up" ? noFollowUpNote.trim() || undefined : undefined,
    no_show_checklist: status === "no_show" ? { waiting_email_sent: noShow.waiting_email_sent === "yes", called_prospect: noShow.called_prospect === "yes", informed_setter: noShow.informed_setter === "yes", waited_ten_minutes: noShow.waited_ten_minutes === "yes" } : undefined,
  });

  const submit = async () => {
    if (!meeting) return;
    const picks = PAIN_OPTIONS.filter((o) => painPicks[o.id]).map((o) => o.label);
    const keyPain = [...picks, painText.trim()].filter(Boolean).join(" · ");
    const feedback = isSat ? {
      call_recording_link: recording.trim(), call_type: "discovery", icp_fit_score: likelihood,
      pain_severity_score: 0, urgency_score: 0, budget_confidence_score: 0, decision_maker_access_score: 0,
      summary: likelihoodNote.trim(), key_pain_points: keyPain, desired_outcome: "",
      decision_process: decision === "other" ? (decisionOther.trim() ? `Other: ${decisionOther.trim()}` : "Other") : (DECISION_OPTIONS.find((o) => o.id === decision)?.label ?? ""),
      objections_raised: "", risks_to_close: "", next_steps_agreed: "", ae_what_went_well: "", ae_what_to_improve: "", support_needed_from_ceo: "",
    } : null;
    await onSave({
      meeting_id: meeting.id,
      meeting_status: isSat ? "sat" : status,
      attendance_confirmed: isSat,
      team_network_member: false,
      contract_value: contractValue ? parseFloat(contractValue) : null,
      contract_term: contractTerm || null,
      statusData: buildStatusData(),
      feedback,
      sector: isSat ? sector.trim() || null : null,
      pain_points: isSat ? painText.trim() || null : null,
      reference: isSat && isReference === "yes" && partnerId ? { partner_id: partnerId, note: referenceNote.trim() } : null,
    });
  };

  if (!meeting) return null;
  const when = (() => { try { return format(new Date(`${meeting.meeting_date}T${meeting.meeting_time}`), "EEE d MMM · HH:mm"); } catch { return `${meeting.meeting_date} ${meeting.meeting_time}`; } })();
  const YesNo = ({ k, label }: { k: string; label: string }) => (
    <div className="flex items-center justify-between gap-3 text-sm"><span>{label}</span>
      <div className="flex gap-1">{(["yes", "no"] as const).map((v) => <Button key={v} type="button" size="sm" variant={noShow[k] === v ? "default" : "outline"} className="h-7 px-3" onClick={() => setNoShow((s) => ({ ...s, [k]: v }))}>{v === "yes" ? "Yes" : "No"}</Button>)}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSaving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{meeting.company_name}</DialogTitle>
              <DialogDescription className="truncate">{meeting.prospect_name}{meeting.prospect_email ? ` · ${meeting.prospect_email}` : ""} · {when}</DialogDescription>
            </div>
            <div className="flex shrink-0 gap-1">
              {meeting.close_lead_link && <Button variant="ghost" size="sm" asChild><a href={meeting.close_lead_link} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Close</a></Button>}
              {onShowDetails && <Button variant="ghost" size="sm" onClick={onShowDetails}>Details</Button>}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={step === 1 ? "default" : "secondary"}>1 · Outcome</Badge>
            <Badge variant={step === 2 ? "default" : "secondary"}>2 · Debrief</Badge>
            {!isSat && status && <span>· no debrief needed for this outcome</span>}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {step === 1 && (
            <>
              <RadioGroup value={status} onValueChange={setStatus} className="space-y-2">
                {[
                  { v: "sat_follow_up", l: "Sat · follow-up booked", i: CalendarCheck },
                  { v: "sat_no_follow_up", l: "Sat · no follow-up", i: UserCheck },
                  { v: "rescheduled", l: "Rescheduled", i: CalendarX },
                  { v: "no_show", l: "No-show", i: PhoneOff },
                  { v: "cancelled", l: "Cancelled", i: Ban },
                ].map(({ v, l, i: Icon }) => (
                  <label key={v} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                    <RadioGroupItem value={v} id={`st-${v}`} /><Icon className="h-4 w-4 text-muted-foreground" /><span>{l}</span>
                  </label>
                ))}
              </RadioGroup>

              {status === "sat_follow_up" && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">When is the follow-up?</p>
                  <p className="text-xs text-muted-foreground">Book it with your link as usual, then put the agreed time here so it shows in Follow-Up Calls.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                    <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                  </div>
                  {followUpLink && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={async () => { try { await navigator.clipboard.writeText(followUpLink); toast.success("Booking link copied"); } catch { toast.message(followUpLink); } }}>
                      <Copy className="h-3.5 w-3.5" /> Copy my follow-up booking link
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div><Label className="text-xs">Contract value (£)</Label><Input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} placeholder="e.g. 3000" /></div>
                    <div><Label className="text-xs">Contract term</Label>
                      <Select value={contractTerm} onValueChange={setContractTerm}><SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="3_months">3 months</SelectItem><SelectItem value="6_months">6 months</SelectItem><SelectItem value="12_months">12 months</SelectItem></SelectContent></Select></div>
                  </div>
                </div>
              )}
              {status === "sat_no_follow_up" && (
                <div className="space-y-2"><Label className="text-sm">Why no follow-up?</Label><Textarea value={noFollowUpNote} onChange={(e) => setNoFollowUpNote(e.target.value)} placeholder="Not a fit because…" /></div>
              )}
              {status === "rescheduled" && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <RadioGroup value={rescheduleMode} onValueChange={(v) => setRescheduleMode(v as "enter_details" | "assign_setter")} className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2"><RadioGroupItem value="enter_details" /> I have the new time</label>
                    <label className="flex items-center gap-2"><RadioGroupItem value="assign_setter" /> Setter to rebook</label>
                  </RadioGroup>
                  {rescheduleMode === "enter_details" && <div className="grid grid-cols-2 gap-2"><Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} /><Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} /></div>}
                </div>
              )}
              {status === "cancelled" && <div className="space-y-2"><Label className="text-sm">Reason</Label><Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>}
              {status === "no_show" && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <YesNo k="waiting_email_sent" label="Sent the “we're waiting” email?" />
                  <YesNo k="called_prospect" label="Called the prospect?" />
                  <YesNo k="informed_setter" label="Told the setter?" />
                  <YesNo k="waited_ten_minutes" label="Waited 10 minutes?" />
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs">Call recording link</Label><Input value={recording} onChange={(e) => setRecording(e.target.value)} placeholder="Fathom / Meet link" /></div>
                <div><Label className="text-xs">Sector {sectorSource === "close" && <span className="text-muted-foreground">(from Close)</span>}</Label><Input value={sector} onChange={(e) => { setSector(e.target.value); setSectorSource("manual"); }} placeholder="e.g. Tech, Finance, Construction" /></div>
              </div>
              <div>
                <Label className="text-xs">How likely to close? <b>{likelihood}/10</b></Label>
                <Slider value={[likelihood]} min={1} max={10} step={1} onValueChange={(v) => setLikelihood(v[0])} className="mt-2" />
                <Input className="mt-2" value={likelihoodNote} onChange={(e) => setLikelihoodNote(e.target.value)} placeholder="Why that number?" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Pain points <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {PAIN_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs cursor-pointer"><Checkbox checked={!!painPicks[o.id]} onCheckedChange={(v) => setPainPicks((p) => ({ ...p, [o.id]: v === true }))} />{o.label}</label>
                  ))}
                </div>
                <Textarea value={painText} onChange={(e) => setPainText(e.target.value)} placeholder="In their words: what's actually hurting them right now?" rows={3} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Decision process</Label>
                <RadioGroup value={decision} onValueChange={setDecision} className="flex flex-wrap gap-3 text-sm">
                  {DECISION_OPTIONS.map((o) => <label key={o.id} className="flex items-center gap-2"><RadioGroupItem value={o.id} />{o.label}</label>)}
                  <label className="flex items-center gap-2"><RadioGroupItem value="other" />Other</label>
                </RadioGroup>
                {decision === "other" && <Input value={decisionOther} onChange={(e) => setDecisionOther(e.target.value)} placeholder="Describe" />}
              </div>
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label className="text-sm">Is this a reference? <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">Yes = they asked to speak to a current client. The partner gets their name, company, sector, mobile, LinkedIn, email and pain points by email and in their portal. Nothing else.</p>
                <div className="flex gap-2">{(["yes", "no"] as const).map((v) => <Button key={v} type="button" size="sm" variant={isReference === v ? "default" : "outline"} onClick={() => setIsReference(v)}>{v === "yes" ? "Yes" : "No"}</Button>)}</div>
                {isReference === "yes" && (
                  <div className="space-y-2 pt-1">
                    <Select value={partnerId} onValueChange={setPartnerId}><SelectTrigger><SelectValue placeholder="Which partner will they speak to?" /></SelectTrigger>
                      <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}{p.company_name ? ` · ${p.company_name}` : ""}</SelectItem>)}</SelectContent></Select>
                    <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="Anything the partner should know (optional)" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 gap-2 sm:justify-between">
          {step === 2 ? <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={isSaving}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button> : <span />}
          {step === 1 && isSat ? (
            <Button type="button" onClick={() => setStep(2)} disabled={!step1Ok}>Debrief <ArrowRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button type="button" onClick={submit} disabled={isSaving || (step === 1 ? !step1Ok : !step2Ok)}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save outcome
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
