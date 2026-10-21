// Full candidate detail, opened from any pipeline surface.
//
// One component, three mounts: the CEO's HR & Hiring view, Ops Command
// Hiring, and the TA's Candidate Tracking tab. Actions are role-gated by the
// `canAct` prop; `ceoView` marks the CEO mount, where the final-interview
// questions are editable and "Pass on" appears in the actions.
//
// Layout (Run 2/3 rulings): a tinted identity header, then card sections —
// booking and the final-interview panel lead, actions follow, and the
// candidate's Enquire answers sit at the bottom (15 Oct 2026, Elena: the
// phone screen and stage history are gone). Visual language matches the
// board: low-alpha tints per section, never solid fills.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  Workflow,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCvScreenings } from "@/hooks/useCvScreenings";
import { useQualificationCriteria } from "@/hooks/useQualificationCriteria";
import type { PipelineCandidateRow } from "@/hooks/useHiringPipeline";
import {
  CV_ACCEPT,
  candidateCvSignedUrl,
  useUploadCandidateCv,
} from "@/hooks/useCandidateCv";
import {
  useFinalInterview,
  useFinalInterviewSchema,
  useUpsertFinalInterview,
  type FinalInterviewAnswers,
} from "@/hooks/useFinalInterview";
import {
  taskProgress,
  useOnboardingRecords,
  useOnboardingTasks,
} from "@/hooks/useEmployeeOnboarding";
import {
  evaluateQualification,
  VERDICT_COPY,
  verdictClasses,
} from "@/lib/phoneScreenQualification";
import { hasReached, stageLabel, stageMeta, stageToneClasses } from "@/lib/hiringPipeline";
import { supabase } from "@/integrations/supabase/client";
import { answersByTitle, type FormSchema } from "@/lib/forms/schema";
import { StageActions } from "./StageActions";
import { TrialDaySection } from "./TrialDaySection";

interface CandidatePipelineDetailProps {
  candidate: PipelineCandidateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False renders a read-only view (TA tracking v1). */
  canAct?: boolean;
  /** True on the CEO mount — final-interview answers become editable. */
  ceoView?: boolean;
  /** Rendered under the stage actions — e.g. the onboarding-profile button. */
  footerSlot?: React.ReactNode;
}

const fmtDate = (d: string | null | undefined) =>
  d ? format(parseISO(d), "EEE d MMM yyyy") : "—";

const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

const initialsOf = (first: string, last: string) =>
  `${(first[0] ?? "").toUpperCase()}${(last[0] ?? "").toUpperCase()}` || "?";

export function CandidatePipelineDetail({
  candidate,
  open,
  onOpenChange,
  canAct = false,
  ceoView = false,
  footerSlot,
}: CandidatePipelineDetailProps) {
  const { data: screenings } = useCvScreenings();

  // Prefer the explicit link written at booking; fall back to an email match
  // for candidates entered before the bridge existed.
  const screening = useMemo(() => {
    if (!candidate) return null;
    const all = screenings ?? [];
    const linked = candidate.cv_screening_id
      ? all.find((s) => s.id === candidate.cv_screening_id)
      : null;
    if (linked) return linked;
    const byLink = all.find(
      (s) => (s as { candidate_id?: string | null }).candidate_id === candidate.id,
    );
    if (byLink) return byLink;
    if (!candidate.email) return null;
    const email = candidate.email.toLowerCase();
    return all.find((s) => (s.email ?? "").toLowerCase() === email) ?? null;
  }, [candidate, screenings]);


  if (!candidate) return null;

  const meta = stageMeta(candidate.stage_key);
  const tone = stageToneClasses[meta?.tone ?? "neutral"];
  const fullName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const lctTime = fmtTime(candidate.lct_booked_time);
  const finalTime = fmtTime(candidate.final_interview_time);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {/* Identity header — tinted band, avatar, stage, contact chips. */}
        <div className="border-b border-border bg-gradient-to-b from-primary/[0.08] via-primary/[0.03] to-transparent px-6 pb-5 pt-6">
          <SheetHeader className="space-y-0 text-left">
            <div className="flex items-start gap-3.5 pr-8">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-lg font-semibold text-primary">
                {initialsOf(candidate.first_name, candidate.last_name)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="font-heading text-xl leading-tight">
                    {fullName || "Unknown"}
                  </SheetTitle>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.pill}`}>
                    {stageLabel(candidate.stage_key)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {candidate.mobile_phone && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {candidate.mobile_phone}
                    </span>
                  )}
                  {candidate.email && (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground">
                      <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{candidate.email}</span>
                    </span>
                  )}
                  {candidate.linkedin_url && (
                    <a
                      href={candidate.linkedin_url.startsWith("http") ? candidate.linkedin_url : `https://${candidate.linkedin_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Linkedin className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Booking info */}
          <SectionCard
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            title="Booking"
            accent="sky"
          >
            <dl className="space-y-1.5 text-sm">
              <Row
                label="Live call trial"
                value={
                  candidate.lct_booked_date
                    ? `${fmtDate(candidate.lct_booked_date)}${lctTime ? ` · ${lctTime}` : ""}`
                    : "—"
                }
              />
              <Row label="Trial call held" value={fmtDate(candidate.ceo_trial_call_date)} />
              <Row
                label="Final interview"
                value={
                  candidate.sdr_interview_date
                    ? `${fmtDate(candidate.sdr_interview_date)}${finalTime ? ` · ${finalTime}` : ""}`
                    : candidate.stage_key === "trial_day"
                    ? "Not booked yet"
                    : "—"
                }
              />
              <Row label="Offer sent" value={fmtDate(candidate.offer_letter_date)} />
              {candidate.offer_wage != null && (
                <Row label="Offer terms" value={`${candidate.offer_wage} · starts ${candidate.offer_start_date ?? "—"}`} />
              )}
              <Row label="Accepted" value={fmtDate(candidate.accepted_date)} />
              {candidate.exit_reason && <Row label="Reason" value={candidate.exit_reason} />}
            </dl>
          </SectionCard>

          {/* The candidate's CV — view it, upload it, replace it. The chase
              alert (banner, card pill, bell) all point here. */}
          <CvSection candidate={candidate} canAct={canAct} />

          {/* Final interview — the CEO's questions and verdict. Front and
              centre AT the Final Interview stage; once the candidate has
              moved past it, it folds away as reference (Run 5 ruling). */}
          {candidate.stage_key === "final_interview" ? (
            <SectionCard
              icon={<ClipboardCheck className="h-3.5 w-3.5" />}
              title="Final interview"
              accent="violet"
            >
              <FinalInterviewSection candidate={candidate} editable={ceoView && canAct} />
            </SectionCard>
          ) : hasReached(candidate.stage_key, "final_interview") ? (
            <CollapsibleSection
              icon={<ClipboardCheck className="h-3.5 w-3.5" />}
              title="Final interview"
            >
              <FinalInterviewSection candidate={candidate} editable={ceoView && canAct} />
            </CollapsibleSection>
          ) : null}

          {/* Trial Day (15 Sep): the day itself, the trialist login and what
              they logged. Stays visible after the stage while a login exists. */}
          {(candidate.stage_key === "trial_day" || !!candidate.trialist_user_id) && (
            <TrialDaySection candidate={candidate} canAct={canAct} />
          )}

          {/* From Onboarding onward the CEO watches; the starter's journey
              is the TA's to run (Run 5 ruling). */}
          {hasReached(candidate.stage_key, "onboarding") && (
            <OnboardingGlanceSection candidate={candidate} />
          )}

          {canAct && !(ceoView && hasReached(candidate.stage_key, "onboarding")) ? (
            <SectionCard
              icon={<Workflow className="h-3.5 w-3.5" />}
              title="Actions"
              accent="neutral"
            >
              <StageActions
                candidate={candidate}
                ceoView={ceoView}
                onDone={() => onOpenChange(false)}
              />
            </SectionCard>
          ) : ceoView && hasReached(candidate.stage_key, "onboarding") ? (
            <p className="px-1 text-xs text-muted-foreground">
              From here the TA runs onboarding and marks them Hired — nothing
              for you to action.
            </p>
          ) : null}

          {footerSlot}

          {/* 15 Oct 2026 (Elena): what they answered on the Enquire form, in
              place of the phone screen and stage history. */}
          <EnquireAnswersSection screeningId={screening?.id ?? candidate.cv_screening_id ?? null} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── CV on file ────────────────────────────────────────────────────────────

// View / Upload / Replace for the candidate's CV. Storage conventions match
// the admin create-candidate flow (flat candidate-cvs bucket, signed URLs —
// see useCandidateCv). The write half is gated on canAct; the TA's writes
// ride the M2 "TA manages candidates" + "TA manages candidate CVs" lanes.
function CvSection({
  candidate,
  canAct,
}: {
  candidate: PipelineCandidateRow;
  canAct: boolean;
}) {
  const upload = useUploadCandidateCv();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);

  const hasCv = !!candidate.cv_file;
  // The chase state the banner/pill/bell describe — say it here too.
  const chase = candidate.stage_key === "final_interview" && !hasCv;

  const viewCv = async () => {
    if (!candidate.cv_file) return;
    setOpening(true);
    try {
      const url = await candidateCvSignedUrl(candidate.cv_file);
      if (url) window.open(url, "_blank");
      else toast.error("Couldn't open the CV — the file may have been removed.");
    } catch (err) {
      toast.error(`Couldn't open the CV: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setOpening(false);
    }
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    try {
      await upload.mutateAsync({
        candidateId: candidate.id,
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        file,
      });
      toast.success(hasCv ? "CV replaced" : "CV uploaded");
    } catch (err) {
      toast.error(`CV upload failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  return (
    <SectionCard
      icon={<FileText className="h-3.5 w-3.5" />}
      title="CV"
      accent="neutral"
    >
      <div className="space-y-2">
        {chase && (
          <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-foreground">
              No CV on file and the final interview is coming up — chase the
              candidate and upload it here.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {hasCv ? "CV on file." : chase ? null : "No CV on file yet."}
          </span>
          {hasCv && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={opening}
              onClick={viewCv}
            >
              {opening ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-2 h-3.5 w-3.5" />
              )}
              View CV
            </Button>
          )}
          {canAct && (
            <Button
              type="button"
              size="sm"
              variant={hasCv ? "outline" : "default"}
              className="h-8"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {upload.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {hasCv ? "Replace CV" : "Upload CV"}
            </Button>
          )}
        </div>
        {canAct && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={CV_ACCEPT}
              className="hidden"
              onChange={onFilePicked}
            />
            <p className="text-xs text-muted-foreground">PDF or Word document.</p>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ── Onboarding at a glance ────────────────────────────────────────────────

// A read-only progress line for anyone opening a candidate at the
// Onboarding/Hired stages — where they are, not controls (those live on the
// TA's Onboarding progress section).
function OnboardingGlanceSection({ candidate }: { candidate: PipelineCandidateRow }) {
  const { data: recordsResult } = useOnboardingRecords();
  const { data: allTasks } = useOnboardingTasks();

  const record = (recordsResult?.data ?? []).find((r) => r.candidate_id === candidate.id);
  const progress = record ? taskProgress(allTasks ?? [])[record.id] : undefined;
  const outstanding = record
    ? (allTasks ?? []).filter((t) => t.onboarding_id === record.id && !t.is_completed)
    : [];

  return (
    <SectionCard
      icon={<GraduationCap className="h-3.5 w-3.5" />}
      title="Onboarding"
      accent="sky"
    >
      {!record ? (
        <p className="text-sm text-muted-foreground">
          No onboarding profile yet — the TA creates it from Candidate
          Tracking &rarr; Onboarding progress.
        </p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {progress ? `${progress.done}/${progress.total} steps complete` : "Steps pending"}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                record.onboarding_state === "completed"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : record.onboarding_state === "in_onboarding"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {record.onboarding_state === "completed"
                ? "Released"
                : record.onboarding_state === "in_onboarding"
                ? "In onboarding"
                : "Not started"}
            </span>
          </div>
          {outstanding.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Outstanding:{" "}
              {outstanding.slice(0, 3).map((t) => t.task_label).join(", ")}
              {outstanding.length > 3 ? ` +${outstanding.length - 3} more` : ""}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Final interview panel ─────────────────────────────────────────────────

function FinalInterviewSection({
  candidate,
  editable,
}: {
  candidate: PipelineCandidateRow;
  editable: boolean;
}) {
  const schema = useFinalInterviewSchema();
  const { data: criteriaResult } = useQualificationCriteria("final_interview");
  const { data: row } = useFinalInterview(schema.tableReady ? candidate.id : null);
  const upsert = useUpsertFinalInterview();

  const allCriteria = useMemo(() => criteriaResult?.data ?? [], [criteriaResult]);
  const criteria = useMemo(() => allCriteria.filter((c) => c.enabled), [allCriteria]);

  const [answers, setAnswers] = useState<FinalInterviewAnswers>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setAnswers(row?.answers ?? {});
    setNotes(row?.notes ?? "");
  }, [row, candidate.id]);

  const verdict = useMemo(
    () => evaluateQualification(allCriteria, answers),
    [allCriteria, answers],
  );

  const baseline = row?.answers ?? {};
  const dirty =
    notes !== (row?.notes ?? "") ||
    criteria.some((c) => (answers[c.question_key] ?? null) !== (baseline[c.question_key] ?? null));

  const save = async () => {
    try {
      await upsert.mutateAsync({
        candidateId: candidate.id,
        answers,
        notes: notes.trim() === "" ? null : notes,
      });
      toast.success("Final interview saved");
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  if (!schema.tableReady) {
    return (
      <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-foreground">
          {schema.loading ? (
            "Checking the database…"
          ) : (
            <>
              Final-interview scoring needs its migration — run{" "}
              <code className="text-xs">docs/pending-migrations/2026-08-18-final-interview-and-offer-handoff.sql</code>{" "}
              in the hosted SQL editor.
            </>
          )}
        </p>
      </div>
    );
  }

  if (criteria.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No final-interview questions are configured yet — set them from the
        Qualification criteria dialog on HR &amp; Hiring.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Live verdict — the CEO's own red/green, from his own framework. */}
      <div className={`rounded-md border px-3 py-2 text-sm ${verdictClasses[verdict.state]}`}>
        <p className="font-semibold">{VERDICT_COPY[verdict.state].label}</p>
        <p className="mt-0.5 text-xs opacity-80">{VERDICT_COPY[verdict.state].blurb}</p>
        {verdict.hardGateFailures.length > 0 && (
          <p className="mt-1 text-xs font-medium">
            Failed gate{verdict.hardGateFailures.length > 1 ? "s" : ""}:{" "}
            {verdict.hardGateFailures.join(", ")}
          </p>
        )}
      </div>

      {criteria.map((c) => {
        const value = (answers[c.question_key] ?? null) as boolean | null;
        return (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <span className="text-sm leading-snug">
              {c.label}
              {c.gate_type === "hard_gate" && (
                <span className="ml-1.5 text-xs text-muted-foreground">(gate)</span>
              )}
            </span>
            {editable ? (
              <div className="flex shrink-0 gap-1.5">
                {([["Yes", true], ["No", false]] as const).map(([label, v]) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    className="h-8 px-3"
                    variant={value === v ? "default" : "outline"}
                    onClick={() =>
                      setAnswers((a) => ({
                        ...a,
                        [c.question_key]: value === v ? null : v,
                      }))
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : (
              <span className="shrink-0 text-sm font-medium text-foreground">
                {value === true ? "Yes" : value === false ? "No" : "—"}
              </span>
            )}
          </div>
        );
      })}

      {editable ? (
        <>
          <Textarea
            className="text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Final-interview notes…"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!dirty || upsert.isPending} onClick={save}>
              {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save final interview
            </Button>
          </div>
        </>
      ) : (
        (row?.notes ?? "") !== "" && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Notes: </span>
            {row!.notes}
          </p>
        )
      )}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────

/** Everything the candidate answered on the Enquire form that put them in the
 * pipeline (form-submit links the response to the screening row). Nothing to
 * show when they were added by hand. */
function EnquireAnswersSection({ screeningId }: { screeningId: string | null }) {
  const { data } = useQuery({
    queryKey: ["enquire-answers-for-screening", screeningId],
    enabled: !!screeningId,
    queryFn: async () => {
      const { data } = await supabase
        .from("form_responses")
        .select("id, answers, completed_at, created_at, forms(name, schema, published_schema)")
        .eq("cv_screening_id", screeningId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown as {
        id: string; answers: Record<string, unknown>; completed_at: string | null; created_at: string;
        forms: { name: string; schema: FormSchema | null; published_schema: FormSchema | null } | null;
      } | null) ?? null;
    },
  });
  if (!data) return null;
  const schema = data.forms?.published_schema ?? data.forms?.schema;
  if (!schema) return null;
  const entries = Object.entries(answersByTitle(schema, data.answers));
  if (entries.length === 0) return null;
  return (
    <SectionCard icon={<FileText className="h-3.5 w-3.5" />} title={`Enquire answers · ${data.forms?.name ?? "form"}`} accent="violet">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Submitted {format(parseISO(data.completed_at ?? data.created_at), "d MMM yyyy, HH:mm")}
      </p>
      <dl className="space-y-1.5 text-sm">
        {entries.map(([q, a]) => (
          <div key={q} className="flex gap-2">
            <dt className="w-52 shrink-0 text-muted-foreground">{q}</dt>
            <dd className="flex-1 whitespace-pre-line text-foreground">{a}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

// Section-card dressing, echoing the board's column accents: low-alpha
// tinted headers, never solid fills.
const SECTION_ACCENTS = {
  sky: { header: "bg-sky-500/10 border-b-sky-500/20", dot: "text-sky-600 dark:text-sky-400" },
  violet: {
    header: "bg-violet-500/10 border-b-violet-500/20",
    dot: "text-violet-600 dark:text-violet-400",
  },
  neutral: { header: "bg-muted/60 border-b-border", dot: "text-muted-foreground" },
} as const;

function SectionCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: keyof typeof SECTION_ACCENTS;
  children: React.ReactNode;
}) {
  const a = SECTION_ACCENTS[accent];
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className={cn("flex items-center gap-2 border-b px-3.5 py-2", a.header)}>
        <span className={a.dot}>{icon}</span>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h4>
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

function CollapsibleSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && <div className="border-t border-border/60 px-3.5 py-3">{children}</div>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-foreground">{value || "—"}</dd>
    </div>
  );
}
