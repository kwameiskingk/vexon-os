// Trial Day (15 Sep 2026): one trialist lead, as Elena sees it in Ops
// Command > Trialist leads and Daniel on his Appointments page. Everything
// the trialist gathered, the Close link to listen to the call, and the two
// ways forward (16 Oct 2026, the owner): book it on the client's calendar, or
// mark it not a fit with a reason. Pushing to a setter is gone.

import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, CalendarPlus, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatProposedTime, trialLeadStatusLabel, useRejectTrialLead, type TrialLead, type TrialLeadStatus } from "@/hooks/useTrialDay";

const STATUS_CLASSES: Record<TrialLeadStatus, string> = {
  submitted: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
  pushed: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30",
  converted: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-muted text-muted-foreground border-border",
};

interface Props {
  lead: TrialLead;
  /** Opens BookTrialLeadDialog: a real booking on the client's calendar. */
  onBook: (lead: TrialLead) => void;
  /** Hide the review actions (e.g. the Dev Centre log). */
  readOnly?: boolean;
  /** Sandbox: handle the reject in memory. */
  onRejectOverride?: (lead: TrialLead, reason: string) => void;
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-border bg-muted/40 text-muted-foreground",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      {children}
    </span>
  );
}

export function TrialLeadCard({ lead, onBook, readOnly = false, onRejectOverride }: Props) {
  const reject = useRejectTrialLead();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const doReject = async () => {
    try {
      if (onRejectOverride) onRejectOverride(lead, reason.trim());
      else await reject.mutateAsync({ leadId: lead.id, reason: reason.trim() });
      toast.success("Marked not a fit. The reason stays with the trialist's record.");
      setRejectOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reject");
    }
  };

  const trialistName = lead.trialist?.full_name || lead.trialist?.email || "Trialist";
  const logged = format(parseISO(lead.created_at), "EEE d MMM · HH:mm");
  const actionable = !readOnly && lead.status !== "converted";

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">
          {lead.company_name || "Unnamed company"}
          {lead.contact_name && (
            <span className="text-muted-foreground">
              {" "}
              · {lead.contact_name}
              {lead.contact_title ? `, ${lead.contact_title}` : ""}
            </span>
          )}
        </h3>
        <Badge variant="outline" className={STATUS_CLASSES[lead.status]}>
          {trialLeadStatusLabel[lead.status]}
        </Badge>
        {lead.client?.company_name && <Chip>{lead.client.company_name}</Chip>}
        {lead.location_choice && <Chip tone={lead.location_choice === "phone" ? "warn" : "neutral"}>{lead.location_choice === "phone" ? "Callback" : "Video call"}</Chip>}
        {lead.push_through_reason && <Chip tone="warn">Pushed through with a reason</Chip>}
        <span className="ml-auto text-xs text-muted-foreground">
          {trialistName} · {logged}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={lead.close_lead_link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
        >
          Open in Close <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
        {lead.currently_hiring === true ? (
          <Chip tone="good">Hiring{lead.job_roles.length ? `: ${lead.job_roles.map((r) => r.title).join(", ")}` : ""}</Chip>
        ) : lead.currently_hiring === false ? (
          <Chip>Not hiring</Chip>
        ) : null}
        {lead.currently_hiring === true && lead.job_spec_provided != null && <Chip>{lead.job_spec_provided ? "Job spec: yes" : "Job spec: no"}</Chip>}
        {lead.open_to_receiving_cvs === true && (
          <Chip tone="good">
            Open to CVs{lead.cv_candidate_titles ? `: ${lead.cv_candidate_titles}` : ""}
            {lead.cv_candidate_level ? ` (${lead.cv_candidate_level})` : ""}
          </Chip>
        )}
        {lead.open_to_receiving_cvs === false && lead.currently_hiring === false && <Chip tone="warn">Not open to CVs</Chip>}
        {lead.other_decision_makers != null && (
          <Chip>
            {lead.other_decision_makers
              ? `Other DMs: ${lead.decision_maker_status === "joining" ? `joining (${lead.decision_maker_email})` : lead.decision_maker_status === "briefed_by_prospect" ? "briefed by prospect" : "email to collect"}`
              : "Sole decision maker"}
          </Chip>
        )}
        {lead.contact_mobile && <Chip>{lead.contact_mobile}</Chip>}
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Times the prospect gave (UK, first choice first)</p>
          <p className="font-medium">{lead.proposed_times.length ? lead.proposed_times.map(formatProposedTime).join(" · ") : "—"}</p>
        </div>
        {lead.push_through_reason && (
          <div>
            <p className="text-xs text-muted-foreground">Why the trialist continued</p>
            <p>{lead.push_through_reason}</p>
          </div>
        )}
        {lead.trialist_notes && (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Trialist notes</p>
            <p>{lead.trialist_notes}</p>
          </div>
        )}
        {lead.review_notes && (
          <div className="sm:col-span-2 rounded-md bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {lead.status === "rejected" ? "Reason not taken forward" : "Note to the setter"}
            </p>
            <p>{lead.review_notes}</p>
          </div>
        )}
        {lead.status === "pushed" && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Pushed to {lead.pushed_to?.full_name || lead.pushed_to?.email || "a setter"}
            {lead.pushed_at ? ` · ${format(parseISO(lead.pushed_at), "EEE d MMM HH:mm")}` : ""}
          </p>
        )}
        {lead.status === "converted" && lead.converted_at && (
          <p className="text-xs text-muted-foreground sm:col-span-2">Booked {format(parseISO(lead.converted_at), "EEE d MMM HH:mm")}</p>
        )}
      </div>

      {actionable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <Button size="sm" className="gap-1.5" onClick={() => onBook(lead)}>
            <CalendarPlus className="h-3.5 w-3.5" /> Book it on {lead.client?.company_name ? `${lead.client.company_name}'s` : "the client's"} calendar
          </Button>
          {lead.status !== "rejected" && (
            <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-3.5 w-3.5" /> Not a fit
            </Button>
          )}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Not a fit?</DialogTitle>
            <DialogDescription>A short reason helps Elena judge the trialist afterwards. The lead stays on record.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Not a decision maker, no real hiring need…" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={doReject}>
              {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
