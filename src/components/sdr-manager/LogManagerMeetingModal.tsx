import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, FileText, Trash2, X } from "lucide-react";

type JobRole = { title: string; salary: number | null; currency: "GBP" | "USD" | "EUR" | "ZAR" };
type LeadType = "video_conference" | "mobile_phone_call" | "terms_sent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged?: () => void;
}

const blankForm = {
  prospect_name: "",
  prospect_email: "",
  prospect_mobile: "",
  prospect_linkedin: "",
  prospect_job_title: "",
  company_name: "",
  company_website: "",
  meeting_date: "",
  meeting_time: "",
  notes: "",
  close_lead_link: "",
  google_meet_link: "",
  currently_hiring: false,
  worked_with_agencies: false,
  reminder_sent: false,
  client_accepted: false,
  client_profile_id: "",
};

export function LogManagerMeetingModal({ open, onOpenChange, onLogged }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [meetingMode, setMeetingMode] = useState<"fresh" | "rebook">("fresh");
  const [leadType, setLeadType] = useState<LeadType>("video_conference");
  const [formData, setFormData] = useState(blankForm);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Job specs (mobile_phone_call)
  const [jobSpecs, setJobSpecs] = useState<Array<{ type: "text" | "file"; content: string; file_name?: string; file?: File }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Terms fees
  const [termsFees, setTermsFees] = useState("");

  // Job roles
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [roleDraft, setRoleDraft] = useState<{ title: string; salary: string; currency: JobRole["currency"] }>({
    title: "",
    salary: "",
    currency: "GBP",
  });

  // Job spec provided
  const [jobSpecProvided, setJobSpecProvided] = useState<"yes" | "no" | null>(null);
  const [jobSpecText, setJobSpecText] = useState("");
  const [jobSpecFile, setJobSpecFile] = useState<File | null>(null);
  const jobSpecFileInputRef = useRef<HTMLInputElement>(null);

  const { data: clientProfiles } = useQuery({
    queryKey: ["manager-log-meeting-client-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_profiles")
        .select("id, company_name, contact_name")
        .eq("status", "active")
        .order("company_name", { ascending: true });
      return data || [];
    },
    enabled: open,
  });

  const reset = () => {
    setMeetingMode("fresh");
    setLeadType("video_conference");
    setFormData(blankForm);
    setClientSearch("");
    setShowClientDropdown(false);
    setJobSpecs([]);
    setTermsFees("");
    setJobRoles([]);
    setRoleDraft({ title: "", salary: "", currency: "GBP" });
    setJobSpecProvided(null);
    setJobSpecText("");
    setJobSpecFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !user) return;

    if (leadType === "mobile_phone_call" && jobSpecs.length === 0) {
      toast({ title: "Job Specs Required", description: "Please add at least one job spec entry.", variant: "destructive" });
      return;
    }
    if (leadType === "terms_sent" && !termsFees.trim()) {
      toast({ title: "Fees Required", description: "Please enter the fee details.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const submissionData: any = {
        prospect_name: formData.prospect_name,
        prospect_email: formData.prospect_email,
        prospect_mobile: formData.prospect_mobile,
        prospect_linkedin: formData.prospect_linkedin,
        prospect_job_title: formData.prospect_job_title,
        company_name: formData.company_name,
        company_website: formData.company_website,
        meeting_date: formData.meeting_date,
        meeting_time: formData.meeting_time,
        notes: formData.notes,
        close_lead_link: formData.close_lead_link,
        google_meet_link: formData.google_meet_link || null,
        reminder_sent: formData.reminder_sent,
        client_accepted: formData.client_accepted,
        accepted_by_client: formData.client_accepted || false,
        // Manager-logged: keep all setter columns NULL so this never affects setter metrics/leaderboards
        setter_id: null,
        setter_profile_id: null,
        logged_by_setter_id: null,
        logged_by_manager_id: user.id,
        status: "pending",
        client_profile_id: formData.client_profile_id || null,
        department: "fulfillment",
        is_rebook: meetingMode === "rebook",
        lead_type: leadType,
        currently_hiring: formData.currently_hiring,
        next_job_title: jobRoles[0]?.title || null,
        worked_with_agencies: formData.worked_with_agencies,
        job_roles: jobRoles.length > 0 ? jobRoles : null,
        job_spec_provided: jobSpecProvided === null ? null : jobSpecProvided === "yes",
        job_spec_text: jobSpecProvided === "yes" && jobSpecText.trim() ? jobSpecText.trim() : null,
      };

      if (leadType === "mobile_phone_call" && jobSpecs.length > 0) {
        const processedSpecs: Array<{ type: string; content: string; file_name?: string }> = [];
        for (const spec of jobSpecs) {
          if (spec.type === "file" && spec.file) {
            const filePath = `${user.id}/${Date.now()}_${spec.file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("job-spec-files")
              .upload(filePath, spec.file);
            if (uploadError) {
              toast({ title: "Upload Error", description: `Failed to upload ${spec.file.name}`, variant: "destructive" });
              setIsSubmitting(false);
              return;
            }
            processedSpecs.push({ type: "file", content: filePath, file_name: spec.file.name });
          } else {
            processedSpecs.push({ type: "text", content: spec.content });
          }
        }
        submissionData.job_specs = processedSpecs;
      }
      if (leadType === "terms_sent" && termsFees.trim()) {
        submissionData.terms_fees = termsFees.trim();
      }

      const { data: insertedMeeting, error } = await supabase
        .from("meetings")
        .insert(submissionData as any)
        .select("id")
        .single();

      if (error) {
        console.error("[LogManagerMeetingModal] insert error:", error);
        toast({ title: "Error logging appointment", description: error.message || "Please try again.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      if (jobSpecProvided === "yes" && jobSpecFile && insertedMeeting?.id) {
        const safeName = jobSpecFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const objectPath = `${insertedMeeting.id}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("job-specs")
          .upload(objectPath, jobSpecFile, { upsert: false });
        if (!upErr) {
          const { data: signed } = await supabase.storage.from("job-specs").createSignedUrl(objectPath, 60 * 60 * 24 * 365);
          const fileUrl = signed?.signedUrl || objectPath;
          await supabase.from("meetings").update({ job_spec_file_url: fileUrl } as any).eq("id", insertedMeeting.id);
        }
      }

      // Manager-logged meetings hit booked instantly — refresh both RAG
      // surfaces rather than waiting for the 5-min global tick.
      queryClient.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
      queryClient.invalidateQueries({ queryKey: ["own-setter-rag"] });
      toast({
        title: "Success",
        description: meetingMode === "rebook" ? "Appointment rebooked successfully!" : "Appointment logged successfully!",
      });
      reset();
      onOpenChange(false);
      onLogged?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Appointment (Manager)</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Logged as you — does not appear on setter leaderboards or affect setter performance.
          </p>
        </DialogHeader>

        <div className="flex border rounded-lg overflow-hidden mb-2">
          <button
            type="button"
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${meetingMode === "fresh" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
            onClick={() => setMeetingMode("fresh")}
          >
            Fresh Appointment
          </button>
          <button
            type="button"
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${meetingMode === "rebook" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
            onClick={() => setMeetingMode("rebook")}
          >
            Rebook Appointment
          </button>
        </div>

        <div className="mb-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Appointment Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "video_conference" as const, label: "Video Meet", icon: "📹" },
              { value: "mobile_phone_call" as const, label: "Job Spec + Callback", icon: "📱" },
              { value: "terms_sent" as const, label: "Terms Sent + Callback", icon: "📄" },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  leadType === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-muted/40"
                }`}
                onClick={() => setLeadType(option.value)}
              >
                <span className="text-xl">{option.icon}</span>
                <span className="text-xs">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {leadType === "mobile_phone_call" && (
          <div className="mb-4 space-y-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Job Specs *</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setJobSpecs([...jobSpecs, { type: "text", content: "" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Type
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setJobSpecs([...jobSpecs, { type: "file", content: "", file_name: file.name, file }]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {jobSpecs.length === 0 && (
              <p className="text-xs text-muted-foreground">Add at least one job spec by typing or uploading a document.</p>
            )}
            {jobSpecs.map((spec, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {spec.type === "text" ? (
                  <Textarea
                    placeholder="Enter job spec details..."
                    value={spec.content}
                    onChange={(e) => {
                      const updated = [...jobSpecs];
                      updated[idx] = { ...spec, content: e.target.value };
                      setJobSpecs(updated);
                    }}
                    className="flex-1 min-h-[60px]"
                  />
                ) : (
                  <div className="flex-1 flex items-center gap-2 p-2 rounded border border-border bg-muted/30">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{spec.file_name}</span>
                  </div>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => setJobSpecs(jobSpecs.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {leadType === "terms_sent" && (
          <div className="mb-4 space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Fee Details *</Label>
            <Textarea value={termsFees} onChange={(e) => setTermsFees(e.target.value)} className="min-h-[80px]" required />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Prospect */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Prospect Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prospect Name *</Label>
                <Input required value={formData.prospect_name} onChange={(e) => setFormData({ ...formData, prospect_name: e.target.value })} />
              </div>
              <div>
                <Label>Prospect Job Title</Label>
                <Input value={formData.prospect_job_title} onChange={(e) => setFormData({ ...formData, prospect_job_title: e.target.value })} />
              </div>
              <div>
                <Label>Prospect Email *</Label>
                <Input type="email" required value={formData.prospect_email} onChange={(e) => setFormData({ ...formData, prospect_email: e.target.value })} />
              </div>
              <div>
                <Label>Prospect Mobile</Label>
                <Input value={formData.prospect_mobile} onChange={(e) => setFormData({ ...formData, prospect_mobile: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Prospect LinkedIn</Label>
                <Input value={formData.prospect_linkedin} onChange={(e) => setFormData({ ...formData, prospect_linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." />
              </div>
            </div>
          </div>

          {/* Company */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Company Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Company Name *</Label>
                <Input required value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} />
              </div>
              <div>
                <Label>Company Website</Label>
                <Input value={formData.company_website} onChange={(e) => setFormData({ ...formData, company_website: e.target.value })} placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* Appointment */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Appointment Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Appointment Date *</Label>
                <Input type="date" required className="[color-scheme:dark]" value={formData.meeting_date} onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })} />
              </div>
              <div>
                <Label>Appointment Time *</Label>
                <Input type="time" required className="[color-scheme:dark]" value={formData.meeting_time} onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional appointment notes..." />
            </div>

            {/* Assign to Client */}
            <div>
              <Label>Assign to Client</Label>
              <div className="mt-1 space-y-2">
                {formData.client_profile_id && (() => {
                  const sel = (clientProfiles || []).find((c) => c.id === formData.client_profile_id);
                  if (!sel) return null;
                  return (
                    <div className="p-2 bg-muted/40 rounded-md border border-border flex items-center justify-between gap-2">
                      <span className="text-sm">{sel.company_name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setFormData({ ...formData, client_profile_id: "" }); setClientSearch(""); }}>
                        Clear
                      </Button>
                    </div>
                  );
                })()}
                <div className="relative">
                  <Input
                    placeholder="Search client..."
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                    onFocus={() => setShowClientDropdown(true)}
                  />
                  {showClientDropdown && clientSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                      {(clientProfiles || [])
                        .filter((c) =>
                          c.company_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                          (c.contact_name && c.contact_name.toLowerCase().includes(clientSearch.toLowerCase()))
                        )
                        .map((client) => (
                          <div
                            key={client.id}
                            className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                            onClick={() => {
                              setFormData({ ...formData, client_profile_id: client.id });
                              setClientSearch(client.company_name);
                              setShowClientDropdown(false);
                            }}
                          >
                            {client.company_name} {client.contact_name ? `(${client.contact_name})` : ""}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Hiring Information */}
          <div className="space-y-5 border-t pt-5">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Hiring Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Are they currently hiring?</Label>
                <Select value={formData.currently_hiring ? "yes" : "no"} onValueChange={(v) => setFormData({ ...formData, currently_hiring: v === "yes" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Have they worked with a recruitment agency before?</Label>
                <Select value={formData.worked_with_agencies ? "yes" : "no"} onValueChange={(v) => setFormData({ ...formData, worked_with_agencies: v === "yes" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Job roles */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-medium">Which roles are they hiring for?</Label>
                <span className="text-[11px] text-muted-foreground">{jobRoles.length} added</span>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-5 space-y-1">
                  <Label className="text-xs text-muted-foreground">Job title</Label>
                  <Input value={roleDraft.title} onChange={(e) => setRoleDraft({ ...roleDraft, title: e.target.value })} placeholder="e.g., Software Engineer" />
                </div>
                <div className="col-span-7 md:col-span-3 space-y-1">
                  <Label className="text-xs text-muted-foreground">Salary</Label>
                  <Input type="number" inputMode="numeric" value={roleDraft.salary} onChange={(e) => setRoleDraft({ ...roleDraft, salary: e.target.value })} placeholder="60000" />
                </div>
                <div className="col-span-5 md:col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <Select value={roleDraft.currency} onValueChange={(v) => setRoleDraft({ ...roleDraft, currency: v as JobRole["currency"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 md:col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      const title = roleDraft.title.trim();
                      if (!title) return;
                      const salaryNum = roleDraft.salary.trim() === "" ? null : Number(roleDraft.salary);
                      setJobRoles([...jobRoles, { title, salary: Number.isFinite(salaryNum as number) ? (salaryNum as number) : null, currency: roleDraft.currency }]);
                      setRoleDraft({ title: "", salary: "", currency: roleDraft.currency });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
              {jobRoles.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {jobRoles.map((r, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{r.title}</span>
                        {r.salary !== null && (
                          <span className="text-muted-foreground text-xs">· {r.currency} {r.salary.toLocaleString()}</span>
                        )}
                      </div>
                      <button type="button" className="text-muted-foreground hover:text-destructive transition-colors" onClick={() => setJobRoles(jobRoles.filter((_, idx) => idx !== i))} aria-label="Remove role">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Job spec provided — hidden when Job Spec + Callback already captured above */}
            {leadType !== "mobile_phone_call" && (
              <div className="space-y-3">
                <Label>Did they provide a job spec?</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={jobSpecProvided === "yes" ? "default" : "outline"} size="sm" onClick={() => setJobSpecProvided("yes")}>Yes</Button>
                  <Button type="button" variant={jobSpecProvided === "no" ? "default" : "outline"} size="sm" onClick={() => { setJobSpecProvided("no"); setJobSpecText(""); setJobSpecFile(null); }}>No</Button>
                </div>
                {jobSpecProvided === "yes" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Upload file</Label>
                      <input ref={jobSpecFileInputRef} type="file" className="hidden" onChange={(e) => setJobSpecFile(e.target.files?.[0] || null)} />
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => jobSpecFileInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        {jobSpecFile ? jobSpecFile.name : "Choose file"}
                      </Button>
                      {jobSpecFile && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setJobSpecFile(null)}>Remove file</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Or paste the spec</Label>
                      <Textarea value={jobSpecText} onChange={(e) => setJobSpecText(e.target.value)} placeholder="Paste the job spec text here..." rows={5} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Internal info */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Internal Information</h3>
            <div>
              <Label>Close Lead Link</Label>
              <Input type="url" value={formData.close_lead_link} onChange={(e) => setFormData({ ...formData, close_lead_link: e.target.value })} placeholder="https://app.close.com/lead/..." />
            </div>
            <div>
              <Label>Google Meet Link</Label>
              <Input type="url" value={formData.google_meet_link} onChange={(e) => setFormData({ ...formData, google_meet_link: e.target.value })} placeholder="https://meet.google.com/..." />
            </div>
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Follow-up Status</h4>
              <div className="flex items-center space-x-2">
                <Checkbox id="mgr_reminder" checked={formData.reminder_sent} onCheckedChange={(checked) => setFormData({ ...formData, reminder_sent: checked as boolean })} />
                <Label htmlFor="mgr_reminder" className="cursor-pointer">Reminder sent?</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="mgr_client_accepted" checked={formData.client_accepted} onCheckedChange={(checked) => setFormData({ ...formData, client_accepted: checked as boolean })} />
                <Label htmlFor="mgr_client_accepted" className="cursor-pointer">Client accepted on call?</Label>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full shadow-glow" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : meetingMode === "rebook" ? "Rebook Appointment" : "Log Appointment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default LogManagerMeetingModal;
