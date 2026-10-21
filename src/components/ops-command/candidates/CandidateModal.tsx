import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Info, Linkedin, Mail, Phone } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CvScreening } from "@/hooks/useCvScreenings";
import { useUpdateCvScreeningReview } from "@/hooks/useUpdateCvScreeningReview";
import {
  usePhoneScreen,
  useUpsertPhoneScreen,
  type PhoneScreen,
} from "@/hooks/usePhoneScreen";
import { useQualificationCriteria } from "@/hooks/useQualificationCriteria";
import { splitName, usePromoteScreeningToCandidate } from "@/hooks/usePromoteScreening";
import { useHiringPipeline } from "@/hooks/useHiringPipeline";
import {
  CV_ACCEPT,
  candidateCvSignedUrl,
  useUploadCandidateCv,
} from "@/hooks/useCandidateCv";
import { useCandidateSourceColumn } from "@/hooks/useCandidateSourceColumn";
import { useBookingEvent, bookCandidateSlot, TRIAL_DAY_EVENT_SLUG } from "@/hooks/useBookingEvent";
import { BookingSlotPicker, utcToLondonParts } from "@/components/bookings/BookingSlotPicker";
import {
  explicitSourceOf,
  isCsvImported,
  sourceLabel,
  sourceOfScreening,
} from "@/lib/candidateSource";
import {
  evaluateQualification,
  type PhoneScreenAnswers,
} from "@/lib/phoneScreenQualification";
import {
  PHONE_SCREEN_QUESTIONS,
  formatAnswer,
} from "@/components/hiring/pipeline/phoneScreenQuestions";
import { QualificationIndicator } from "./QualificationIndicator";
import { TypeformAnswersBlock, typeformAnswersOf, type ScreeningWithTypeform } from "./TypeformAnswersBlock";
import {
  REVIEW_STATUS_OPTIONS,
  gateLabel,
  gatePillClasses,
} from "./candidateLabels";

interface CandidateModalProps {
  candidate: CvScreening | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False on TA-facing mounts — the 17 Aug ruling hides the numeric score
      from the TA. The score stays in the data; only the pill goes. */
  showScore?: boolean;
}

const UNSET_STATUS = "__unset__";

const linkedinHref = (url: string) =>
  url.startsWith("http") ? url : `https://${url}`;

// House tone-rail idiom (manager-surface vocabulary): emerald=good,
// amber=weak — deliberately not red, cons aren't verdicts — sky=ask/info.
const SECTION_TONES = {
  neutral: "",
  good: "border-l-2 border-l-emerald-500 bg-emerald-500/[0.05] rounded-r-lg pl-3 pr-2 py-2",
  weak: "border-l-2 border-l-amber-500 bg-amber-500/[0.05] rounded-r-lg pl-3 pr-2 py-2",
  ask: "border-l-2 border-l-sky-500 bg-sky-500/[0.05] rounded-r-lg pl-3 pr-2 py-2",
} as const;

function BulletSection({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: keyof typeof SECTION_TONES;
}) {
  if (items.length === 0) return null;
  return (
    <div className={SECTION_TONES[tone]}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground flex gap-2">
            <span className="text-muted-foreground shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Elena's four-option lead-mix answer (24 Aug catch-up). The numeric
// pct_cold/pct_warm columns are still written — a representative number per
// band — so existing numeric qualification criteria keep evaluating.
const COLD_MIX_OPTIONS = [
  { value: "all_cold", label: "(a) All cold — 100%", pctCold: 100 },
  { value: "mostly_cold", label: "(b) Mostly cold — around 80–99%", pctCold: 90 },
  { value: "even_mix", label: "(c) An even mix — around 50/50", pctCold: 50 },
  { value: "mostly_warm", label: "(d) Mostly warm — under 50% cold", pctCold: 30 },
] as const;

// Legacy rows captured a numeric split before the band existed — show them
// as the nearest band so old screens still read sensibly.
const bandFromPct = (pctCold: number | null | undefined): string => {
  if (pctCold == null) return "";
  if (pctCold >= 100) return "all_cold";
  if (pctCold >= 80) return "mostly_cold";
  if (pctCold >= 45) return "even_mix";
  return "mostly_warm";
};

// Phone-screen form state: numbers held as strings while typing (empty =
// unanswered), parsed to null-or-number only on save. Dials/day and
// appts/month are free text as spoken ("50-100", "100+") — 1 Sep ruling —
// with a conservative number derived on save for qualification criteria.
interface PhoneForm {
  age: string;
  b2bLast6mo: boolean | null;
  jobTitle: string;
  whatTheySell: string;
  countries: string;
  ukSoldWhat: string;
  dialsPerDay: string;
  coldMixBand: string;
  apptsPerMonth: string;
  yearsExperience: string;
  accentPass: boolean | null;
  hasEquipment: boolean | null;
  noticePeriod: string;
  hasChildren: boolean | null;
  childcareSupport: boolean | null;
  healthAdjustments: boolean | null;
}

const numStr = (n: number | null) => (n === null ? "" : String(n));

function formFromRow(row: PhoneScreen | null): PhoneForm {
  return {
    age: numStr(row?.age ?? null),
    b2bLast6mo: row?.b2b_cold_calling_last_6mo ?? null,
    jobTitle: row?.current_job_title ?? "",
    whatTheySell: row?.what_they_sell ?? "",
    countries: row?.countries_sold_into ?? "",
    ukSoldWhat: row?.uk_sold_what ?? "",
    // Raw text wins; rows saved before 1 Sep show their stored number.
    dialsPerDay: row?.avg_dials_per_day_raw ?? numStr(row?.avg_dials_per_day ?? null),
    coldMixBand: row?.cold_mix_band ?? bandFromPct(row?.pct_cold_leads),
    apptsPerMonth:
      row?.avg_appointments_per_month_raw ?? numStr(row?.avg_appointments_per_month ?? null),
    yearsExperience: numStr(row?.years_b2b_cold_calling ?? null),
    accentPass: row?.accent_pass ?? null,
    hasEquipment: row?.has_equipment ?? null,
    noticePeriod: row?.notice_period ?? "",
    hasChildren: row?.has_children ?? null,
    childcareSupport: row?.childcare_support ?? null,
    healthAdjustments: row?.health_adjustments ?? null,
  };
}

const strOrNull = (s: string) => (s.trim() === "" ? null : s);
const numOrNull = (s: string) => {
  const n = Number(s.trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
// A range answer's conservative number for the qualification criteria:
// the FIRST number in the text — "50-100" scores as 50, "100+" as 100 —
// so an "at least N" gate never passes on the optimistic end of a range.
const firstNumber = (s: string): number | null => {
  const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const pctColdForBand = (band: string): number | null =>
  COLD_MIX_OPTIONS.find((o) => o.value === band)?.pctCold ?? null;

// The scoreable answers, keyed by their candidate_phone_screens column
// names so qualification_criteria.question_key needs no translation table.
// Notes is free text and is deliberately not scoreable. pct_cold_leads is
// derived from the band so numeric criteria keep working.
const answersFromForm = (f: PhoneForm): PhoneScreenAnswers => ({
  age: numOrNull(f.age),
  b2b_cold_calling_last_6mo: f.b2bLast6mo,
  current_job_title: f.jobTitle,
  what_they_sell: f.whatTheySell,
  countries_sold_into: f.countries,
  uk_sold_what: f.ukSoldWhat,
  avg_dials_per_day: firstNumber(f.dialsPerDay),
  cold_mix_band: f.coldMixBand || null,
  pct_cold_leads: pctColdForBand(f.coldMixBand),
  avg_appointments_per_month: firstNumber(f.apptsPerMonth),
  years_b2b_cold_calling: numOrNull(f.yearsExperience),
  accent_pass: f.accentPass,
  has_equipment: f.hasEquipment,
  notice_period: f.noticePeriod,
  has_children: f.hasChildren,
  childcare_support: f.childcareSupport,
  health_adjustments: f.healthAdjustments,
});

// Elena's hover notes — verbatim from her sheet's cell comments. Rendered
// on an ⓘ the TA hovers; deliberately not inline so the panel stays calm.
const ASK_NOTES = {
  accent:
    "How Elena asks it: “I am going to send you an SMS of a paragraph I'd like for you to read back to me. Don't change anything about the paragraph — I want you to say it back to me in your dialer voice/accent, the same one you'd use with prospects over the phone when pitching.”",
  equipment:
    "How to ask it: “This position requires you to have your own working laptop and internet connection — do you have these?”",
  notice: "How to ask it: “If you were to be successful, how soon could you get started?”",
} as const;

const BOOKED_STATUS = "booked";
const todayIso = () => new Date().toISOString().slice(0, 10);

function YesNoToggle({
  value,
  onChange,
  labels = ["Yes", "No"],
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  /** ["truthy label", "falsy label"] — e.g. ["Pass", "Fail"] for accent. */
  labels?: [string, string];
}) {
  return (
    <div className="flex gap-1.5">
      {([[labels[0], true], [labels[1], false]] as const).map(([label, v]) => (
        <Button
          key={label}
          type="button"
          size="sm"
          className="h-8 px-3"
          variant={value === v ? "default" : "outline"}
          onClick={() => onChange(value === v ? null : v)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

// Elena's "how I announce this" notes: a quiet ⓘ the TA hovers mid-call —
// present when needed, invisible when not (her 24 Aug ask).
function AskHint({ note }: { note: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="How to ask this question"
          className="ml-1.5 inline-flex translate-y-[2px] text-muted-foreground/60 transition-colors hover:text-primary focus-visible:text-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" align="start" className="max-w-[19rem] text-xs leading-snug">
        {note}
      </TooltipContent>
    </Tooltip>
  );
}

// Compact question layouts for the phone-screen panel: short answers sit
// on the same line as the question; free-text answers go underneath.
function QuestionRow({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={htmlFor} className="text-sm font-normal leading-snug">
        {label}
      </Label>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function QuestionBlock({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-normal leading-snug">
        {label}
      </Label>
      {children}
    </div>
  );
}

const qNum = (n: number) => (
  <span className="text-muted-foreground tabular-nums mr-1">{n}.</span>
);

export function CandidateModal({
  candidate,
  open,
  onOpenChange,
  showScore = true,
}: CandidateModalProps) {
  const [status, setStatus] = useState<string>(UNSET_STATUS);
  const [notes, setNotes] = useState("");
  const [phoneForm, setPhoneForm] = useState<PhoneForm>(formFromRow(null));
  // LCT booking details, captured when the caller selects Booked.
  const [lctDate, setLctDate] = useState("");
  const [lctTime, setLctTime] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  // Live slot on Marcus's calendar (Vexon OS Bookings); manual entry stays as
  // the fallback so a paused engine never blocks a phone screen.
  const [lctSlot, setLctSlot] = useState<string | null>(null);
  const [lctManual, setLctManual] = useState(false);
  // Required when booking someone the framework marks Not qualified.
  const [bookReason, setBookReason] = useState("");
  const [phoneScreenOpen, setPhoneScreenOpen] = useState(false);
  // CV chosen during the screen. At phone-screen time a candidates row may
  // not exist yet, so the file is held here and uploaded on Save once a row
  // is there to hang it on (booking creates one).
  const [cvUpload, setCvUpload] = useState<File | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const updateReview = useUpdateCvScreeningReview();
  const upsertPhoneScreen = useUpsertPhoneScreen();
  const uploadCv = useUploadCandidateCv();
  const { data: pipelineResult } = useHiringPipeline();
  const promote = usePromoteScreeningToCandidate();
  const sourceColumn = useCandidateSourceColumn();
  const { data: phoneScreen } = usePhoneScreen(candidate?.id ?? null);
  const { data: criteriaResult } = useQualificationCriteria("phone_screen");
  const { data: lctEvent } = useBookingEvent(TRIAL_DAY_EVENT_SLUG);

  useEffect(() => {
    setStatus(candidate?.review_status ?? UNSET_STATUS);
    setNotes(candidate?.ops_notes ?? "");
    setLctDate("");
    setLctTime("");
    setLctSlot(null);
    setLctManual(false);
    setBookingEmail(candidate?.email ?? "");
    setBookReason("");
    setCvUpload(null);
  }, [candidate]);

  useEffect(() => {
    setPhoneForm(formFromRow(phoneScreen ?? null));
  }, [phoneScreen, candidate?.id]);

  // The linked candidates row, when this screening has already been promoted
  // — it carries cv_file, so the modal can offer View/Replace immediately.
  const linkedCandidateId =
    (candidate as (CvScreening & { candidate_id?: string | null }) | null)
      ?.candidate_id ?? null;
  const linkedCandidate = useMemo(
    () => (pipelineResult?.data ?? []).find((r) => r.id === linkedCandidateId) ?? null,
    [pipelineResult, linkedCandidateId],
  );

  if (!candidate) return null;

  // CSV-imported candidates have no agent output, so the big two-pane layout
  // would show an empty left half. They get a compact single-pane modal:
  // contacts up top, the questions, status + save — nothing else (Run 2).
  const compact = isCsvImported(candidate);
  // 11 Sep: imported rows screen themselves on the Typeform. Their answers
  // lead the card and the phone-screen questions sit behind a toggle.
  const typeformAnswers = typeformAnswersOf(candidate);
  const showPhoneScreen = !compact || phoneScreenOpen;

  const setPhone = <K extends keyof PhoneForm>(key: K, value: PhoneForm[K]) =>
    setPhoneForm((f) => ({ ...f, [key]: value }));

  const reviewDirty =
    status !== (candidate.review_status ?? UNSET_STATUS) ||
    notes !== (candidate.ops_notes ?? "");
  const phoneBaseline = formFromRow(phoneScreen ?? null);
  const phoneDirty = (Object.keys(phoneForm) as (keyof PhoneForm)[]).some(
    (k) => phoneForm[k] !== phoneBaseline[k],
  );
  const cvOnFile = linkedCandidate?.cv_file ?? null;
  const saving =
    updateReview.isPending ||
    upsertPhoneScreen.isPending ||
    promote.isPending ||
    uploadCv.isPending;

  // Live verdict, recomputed as the caller types. It never blocks a decision
  // outright, but a red (not_qualified) verdict makes booking ask for a short
  // reason before Save commits (17 Aug ruling) — see reasonRequired below.
  const verdict = evaluateQualification(
    criteriaResult?.data ?? [],
    answersFromForm(phoneForm),
  );

  // Booking an LCT is what promotes a screening into the hiring pipeline, so
  // it needs a date. Only asked for when Booked is newly selected.
  const bookingRequested =
    status === BOOKED_STATUS && candidate.review_status !== BOOKED_STATUS;
  // A staged CV counts as unsaved work when Save can actually attach it — a
  // candidates row already exists, OR this save is the booking that creates
  // one (handleSave uploads onto promote's returned id). Otherwise the file
  // has nowhere to land, so it stays inert rather than pretending to save.
  const cvDirty = cvUpload !== null && (linkedCandidateId !== null || bookingRequested);
  const dirty = reviewDirty || phoneDirty || cvDirty;
  // 17 Aug ruling: booking someone the framework shows as Not qualified (red)
  // requires a short typed reason before the save commits. Qualified,
  // in-progress, or not-configured stays one-click.
  const reasonRequired = bookingRequested && verdict.state === "not_qualified";
  const reasonMissing = reasonRequired && bookReason.trim() === "";
  const bookingIncomplete =
    bookingRequested && (!lctDate || !bookingEmail.trim() || reasonMissing);

  const handleSave = async () => {
    try {
      let promotedId: string | null = null;
      if (bookingRequested) {
        promotedId = await promote.mutateAsync({
          cvScreeningId: candidate.id,
          fullName: candidate.full_name,
          email: bookingEmail.trim(),
          phone: candidate.phone,
          linkedinUrl: candidate.linkedin_url,
          lctDate,
          lctTime: lctTime || null,
          existingCandidateId:
            (candidate as CvScreening & { candidate_id?: string | null }).candidate_id ?? null,
          firstName: (candidate as ScreeningWithTypeform).first_name ?? null,
          lastName: (candidate as ScreeningWithTypeform).last_name ?? null,
          closeLeadUrl: (candidate as ScreeningWithTypeform).close_lead_url ?? null,
          // Origin tag, once candidates.source exists (fail-soft before).
          ...(sourceColumn.applied ? { source: sourceOfScreening(candidate) } : {}),
        });
      }
      // A booked-while-red reason is appended to the notes, which follow the
      // candidate onto the pipeline (the detail sheet shows ops_notes).
      const reasonLine = reasonRequired
        ? `Booked while not qualified — reason: ${bookReason.trim()}`
        : null;
      const notesOut = [notes.trim(), reasonLine].filter(Boolean).join("\n");
      const writes: Promise<unknown>[] = [];
      if (reviewDirty || reasonLine) {
        writes.push(
          updateReview.mutateAsync({
            id: candidate.id,
            review_status: status === UNSET_STATUS ? null : status,
            ops_notes: notesOut === "" ? null : notesOut,
          }),
        );
      }
      if (phoneDirty) {
        const derivedPctCold = phoneForm.coldMixBand
          ? pctColdForBand(phoneForm.coldMixBand)
          : phoneScreen?.pct_cold_leads ?? null;
        writes.push(
          upsertPhoneScreen
            .mutateAsync({
              cv_screening_id: candidate.id,
              age: numOrNull(phoneForm.age),
              b2b_cold_calling_last_6mo: phoneForm.b2bLast6mo,
              current_job_title: strOrNull(phoneForm.jobTitle),
              what_they_sell: strOrNull(phoneForm.whatTheySell),
              countries_sold_into: strOrNull(phoneForm.countries),
              uk_sold_what: strOrNull(phoneForm.ukSoldWhat),
              // Range answers ship both ways: the text as spoken for humans,
              // the first number in it for the qualification criteria.
              avg_dials_per_day: firstNumber(phoneForm.dialsPerDay),
              avg_dials_per_day_raw: strOrNull(phoneForm.dialsPerDay),
              cold_mix_band: phoneForm.coldMixBand || null,
              // The numeric split stays derived from the band (legacy value
              // preserved when no band is picked) so numeric criteria and
              // older read-only surfaces keep working.
              pct_cold_leads: derivedPctCold,
              pct_warm_leads: derivedPctCold === null ? phoneScreen?.pct_warm_leads ?? null : 100 - derivedPctCold,
              avg_appointments_per_month: firstNumber(phoneForm.apptsPerMonth),
              avg_appointments_per_month_raw: strOrNull(phoneForm.apptsPerMonth),
              years_b2b_cold_calling: numOrNull(phoneForm.yearsExperience),
              accent_pass: phoneForm.accentPass,
              has_equipment: phoneForm.hasEquipment,
              notice_period: strOrNull(phoneForm.noticePeriod),
              has_children: phoneForm.hasChildren,
              // A "no children" answer means the care question was never
              // asked — clear it rather than carrying a stale yes/no.
              childcare_support:
                phoneForm.hasChildren === true ? phoneForm.childcareSupport : null,
              health_adjustments: phoneForm.healthAdjustments,
            })
            .then((outcome) => {
              if (outcome.newAnswersDropped) {
                toast.warning(
                  "Saved, but the newest questions (job title, ranges, children/care, health) couldn't be stored yet — run the 2026-09-01 phone-screen migration.",
                );
              }
            }),
        );
      }
      await Promise.all(writes);
      // Attach the staged CV once there's a candidates row to hang it on —
      // the one booking just created, or the one already linked. A file
      // staged with neither stays put until the trial is booked.
      let cvNote = "";
      const cvTargetId = promotedId ?? linkedCandidateId;
      if (cvUpload && cvTargetId) {
        try {
          const { first, last } = splitName(candidate.full_name);
          await uploadCv.mutateAsync({
            candidateId: cvTargetId,
            firstName: first,
            lastName: last,
            file: cvUpload,
          });
          setCvUpload(null);
          cvNote = " · CV attached";
        } catch (cvErr) {
          toast.error(
            `Saved, but the CV upload failed: ${cvErr instanceof Error ? cvErr.message : "unknown error"}. ` +
            `Retry from the candidate's pipeline card.`,
          );
        }
      }
      // Live slot picked → put it on Marcus's calendar and invite the
      // candidate (Google invite + SMS + reminders). The pipeline entry above
      // is already saved either way, so a booking hiccup loses nothing.
      let calendarNote = "";
      if (bookingRequested && lctSlot && lctEvent && !lctManual) {
        // Marcus's 1 Sep ruling: the LCT calendar event carries the phone-
        // screen Q&A so he reads it in the calendar popup — and he confirmed
        // the candidate seeing their own answers is fine. Q14/Q15 (children/
        // care, health) deliberately stay out of the invite: they're
        // sensitive logistics facts, not interview material.
        const screenRow: Record<string, unknown> = {
          ...answersFromForm(phoneForm),
          avg_dials_per_day_raw: strOrNull(phoneForm.dialsPerDay),
          avg_appointments_per_month_raw: strOrNull(phoneForm.apptsPerMonth),
          childcare_support:
            phoneForm.hasChildren === true ? phoneForm.childcareSupport : null,
        };
        const bookingAnswers: Record<string, string> = {};
        for (const q of PHONE_SCREEN_QUESTIONS) {
          if (q.key === "has_children" || q.key === "health_adjustments") continue;
          const v = formatAnswer(q, screenRow);
          if (v !== "—") bookingAnswers[q.label] = v;
        }
        // 11 Sep: the Typeform self-screening rides along the same way, so
        // Marcus reads it in the calendar popup before the trial.
        for (const [label, value] of Object.entries(typeformAnswers).slice(0, 30)) {
          if (!(label in bookingAnswers) && value) bookingAnswers[label] = value;
        }
        const booked = await bookCandidateSlot({
          eventTypeId: lctEvent.eventTypeId,
          hostUserId: lctEvent.hostUserId,
          startsAt: lctSlot,
          name: candidate.full_name,
          email: bookingEmail.trim(),
          mobile: candidate.phone,
          // Marcus runs the trial off his phone and wants the candidate in
          // front of him (25 Aug). The only other attendee IS the candidate,
          // so these are their own details.
          inviteDetails: [
            { label: "Candidate", value: candidate.full_name },
            { label: "Mobile", value: candidate.phone },
            { label: "Email", value: bookingEmail.trim() },
            { label: "LinkedIn", value: candidate.linkedin_url },
          ],
          answers: bookingAnswers,
        });
        if (booked.ok) {
          calendarNote = " · Marcus's calendar booked + invite sent";
          if (candidate.phone && booked.smsSent === false) {
            toast.warning(
              "Booked, but the confirmation SMS didn't send — the number may be invalid. Check Deliveries or text them yourself.",
            );
          }
        } else {
          toast.error(
            `Pipeline entry saved, but the calendar booking failed: ${booked.error}. ` +
            `The date is recorded — retry or book Marcus's calendar manually.`,
          );
        }
      }
      toast.success(
        (bookingRequested ? "Booked — added to the hiring pipeline" : "Review saved") +
          cvNote +
          calendarNote,
      );
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const gates = [
    { label: "Tenure", value: candidate.gate_tenure },
    { label: "Recency", value: candidate.gate_recency },
  ].filter((g): g is { label: string; value: string } => g.value !== null);

  const rawFields = [
    { label: "Daily output", value: candidate.daily_output },
    { label: "B2B or B2C", value: candidate.b2b_or_b2c },
    { label: "Notice period", value: candidate.notice_period_raw },
    { label: "Salary expectation", value: candidate.salary_expectation_raw },
    { label: "Languages", value: candidate.languages_raw },
    { label: "Matric year", value: candidate.matric_year_raw },
  ].filter((f): f is { label: string; value: string } => f.value !== null);

  const identityFlagged =
    candidate.identity_check === "partial_mismatch" ||
    candidate.identity_check === "mismatch";

  const handleViewCv = async () => {
    if (!cvOnFile) return;
    try {
      const url = await candidateCvSignedUrl(cvOnFile);
      if (url) window.open(url, "_blank");
      else toast.error("Couldn't open the CV — the file may have been removed.");
    } catch (err) {
      toast.error(
        `Couldn't open the CV: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  // CV attach (Marcus's CV-chase feature). Shown in the left pane next to
  // the agent's "From the CV" summary — and at the foot of the questions in
  // compact (CSV) mode, where there is no left pane.
  const cvBlock = (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Candidate CV
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        {cvOnFile && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={handleViewCv}
          >
            <FileText className="mr-2 h-3.5 w-3.5" />
            View CV
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => cvInputRef.current?.click()}
        >
          {cvOnFile ? "Replace CV…" : "Attach CV…"}
        </Button>
        {!cvOnFile && !cvUpload && (
          <span className="text-xs text-muted-foreground">PDF or Word document.</span>
        )}
      </div>
      {cvUpload && (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{cvUpload.name}</span>
          {linkedCandidateId
            ? " — uploads when you press Save."
            : " — uploads when the trial is booked (pick Booked and Save)."}
        </p>
      )}
      <input
        ref={cvInputRef}
        type="file"
        accept={CV_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) setCvUpload(file);
        }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          compact
            ? "sm:max-w-2xl h-[88vh] p-0 gap-0 flex flex-col overflow-hidden"
            : "sm:max-w-6xl h-[92vh] p-0 gap-0 flex flex-col overflow-hidden"
        }
      >
        {/* Header spans both panes: who this is + the agent's verdict at a glance. */}
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pb-4 pr-14 text-left space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <DialogTitle className="font-heading text-xl">{candidate.full_name}</DialogTitle>
            {showScore && candidate.score !== null && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
                Score {candidate.score}
              </span>
            )}
            {/* Where the CV came from — the Drive job-board folder for agent
                rows (since 1 Sep), the declared source for CSV imports. Rows
                predating source labelling have no explicit source: no chip. */}
            {explicitSourceOf(candidate) && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {sourceLabel(explicitSourceOf(candidate)!)}
                {compact ? " import" : ""}
              </span>
            )}
            {gates.map((g) => (
              <span
                key={g.label}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${gatePillClasses[g.value] ?? gatePillClasses.unknown}`}
              >
                {g.label}: {gateLabel(g.value)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pt-1">
            {candidate.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {candidate.phone}
              </span>
            )}
            {candidate.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {candidate.email}
              </span>
            )}
            {candidate.linkedin_url && (
              <a
                href={linkedinHref(candidate.linkedin_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Two panes on lg+ for agent-screened candidates: agent output left,
            phone-screen panel right — each scrolls on its own so the
            questions never leave the screen. Below lg they stack and the
            whole body scrolls as one. Compact (CSV) mode: one pane, just the
            questions. */}
        <div
          className={
            compact
              ? "flex-1 min-h-0 flex flex-col overflow-hidden"
              : "flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
          }
        >
          {!compact && (
          <div className="lg:flex-1 lg:overflow-y-auto px-6 py-5 space-y-5">
            <BulletSection title="Pros" items={candidate.pros} tone="good" />
          <BulletSection title="Cons" items={candidate.cons} tone="weak" />
          <BulletSection title="Gaps to probe on the call" items={candidate.gaps_to_probe} tone="ask" />

          {candidate.reasoning && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Reasoning
              </h4>
              <p className="text-sm text-foreground">{candidate.reasoning}</p>
            </div>
          )}

          {rawFields.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                From the CV
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {rawFields.map((f) => (
                  <div key={f.label} className="flex gap-2 text-sm">
                    <dt className="text-muted-foreground shrink-0">{f.label}:</dt>
                    <dd className="text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {cvBlock}

          {identityFlagged && (
            <div className="flex gap-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                The name on the CV doesn&apos;t fully match the LinkedIn profile
                name{candidate.identity_check === "mismatch" ? "" : " (partial mismatch)"}.
                Often innocent — maiden name, nickname, married name — so ask
                about it on the call rather than reading it as a strike.
              </p>
            </div>
          )}

          </div>
          )}

          {/* Phone-screen panel — Elena's side, her 15-question script plus
              notes. Wider than before so the full-sentence questions breathe;
              the list scrolls on its own while status + Save stay pinned. */}
          <div
            className={
              compact
                ? "flex min-h-0 flex-1 flex-col bg-muted/30"
                : "lg:w-[34rem] lg:shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-border bg-muted/30"
            }
          >
            <div
              className={
                compact
                  ? "flex-1 min-h-0 overflow-y-auto px-5 py-3.5 space-y-2.5"
                  : "lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-5 py-3.5 space-y-2.5"
              }
            >
              {compact && <TypeformAnswersBlock screening={candidate} />}

              {compact ? (
                <button
                  type="button"
                  onClick={() => setPhoneScreenOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
                  aria-expanded={showPhoneScreen}
                >
                  <span>Phone screen questions (optional)</span>
                  <span className="normal-case tracking-normal font-normal">{showPhoneScreen ? "Hide" : "Show"}</span>
                </button>
              ) : (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ops review — phone screen
                </h4>
              )}

              {showPhoneScreen && (
              <>
              <QualificationIndicator verdict={verdict} />

              {/* Elena's script, verbatim (24 Aug catch-up + her sheet).
                  Full-sentence questions; the ⓘ notes carry how she
                  announces the ones that need announcing. */}
              <QuestionRow
                htmlFor="ps-age"
                label={<>{qNum(1)}Firstly, how old are you?</>}
              >
                <Input
                  id="ps-age"
                  type="number"
                  min={14}
                  max={99}
                  step={1}
                  className="h-8 w-20 text-sm"
                  value={phoneForm.age}
                  onChange={(e) => setPhone("age", e.target.value)}
                />
              </QuestionRow>

              <QuestionRow
                label={
                  <>
                    {qNum(2)}Have you done B2B appointment setting via cold
                    calling in the last 6 months?
                  </>
                }
              >
                <YesNoToggle
                  value={phoneForm.b2bLast6mo}
                  onChange={(v) => setPhone("b2bLast6mo", v)}
                />
              </QuestionRow>

              <QuestionBlock
                htmlFor="ps-job-title"
                label={<>{qNum(3)}What is your current job title?</>}
              >
                <Input
                  id="ps-job-title"
                  className="h-8 text-sm"
                  value={phoneForm.jobTitle}
                  onChange={(e) => setPhone("jobTitle", e.target.value)}
                />
              </QuestionBlock>

              <QuestionBlock
                htmlFor="ps-sell"
                label={
                  <>
                    {qNum(4)}What do you sell / what did you sell in your last
                    B2B appointment setting role?
                  </>
                }
              >
                <Input
                  id="ps-sell"
                  className="h-8 text-sm"
                  value={phoneForm.whatTheySell}
                  onChange={(e) => setPhone("whatTheySell", e.target.value)}
                />
              </QuestionBlock>

              <QuestionBlock
                htmlFor="ps-countries"
                label={
                  <>
                    {qNum(5)}Have you ever sold into, or spoken to, UK clients
                    before?
                  </>
                }
              >
                <Input
                  id="ps-countries"
                  className="h-8 text-sm"
                  placeholder="e.g. UK / USA — or No"
                  value={phoneForm.countries}
                  onChange={(e) => setPhone("countries", e.target.value)}
                />
              </QuestionBlock>

              <QuestionBlock
                htmlFor="ps-uk-sold"
                label={
                  <>
                    {qNum(6)}
                    <span className="text-muted-foreground">(follow-up)</span>{" "}
                    What were you selling to those UK clients?
                  </>
                }
              >
                <Input
                  id="ps-uk-sold"
                  className="h-8 text-sm"
                  value={phoneForm.ukSoldWhat}
                  onChange={(e) => setPhone("ukSoldWhat", e.target.value)}
                />
              </QuestionBlock>

              <QuestionRow
                htmlFor="ps-dials"
                label={<>{qNum(7)}How many dials do you do per day on average?</>}
              >
                {/* Free text on purpose (1 Sep): candidates answer in ranges
                    ("50-100", "100+") and Marcus wants to read the range as
                    given. A number-type input silently swallowed those. */}
                <Input
                  id="ps-dials"
                  className="h-8 w-28 text-sm"
                  placeholder="e.g. 50-100"
                  value={phoneForm.dialsPerDay}
                  onChange={(e) => setPhone("dialsPerDay", e.target.value)}
                />
              </QuestionRow>

              <QuestionBlock label={<>{qNum(8)}Would you say your leads were…</>}>
                <Select
                  value={phoneForm.coldMixBand || undefined}
                  onValueChange={(v) => setPhone("coldMixBand", v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pick the closest mix" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLD_MIX_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuestionBlock>

              <QuestionRow
                htmlFor="ps-appts"
                label={
                  <>
                    {qNum(9)}What is the average number of appointments you book
                    per month?
                  </>
                }
              >
                <Input
                  id="ps-appts"
                  className="h-8 w-28 text-sm"
                  placeholder="e.g. 10-15"
                  value={phoneForm.apptsPerMonth}
                  onChange={(e) => setPhone("apptsPerMonth", e.target.value)}
                />
              </QuestionRow>

              <QuestionRow
                htmlFor="ps-years"
                label={
                  <>
                    {qNum(10)}How many years of B2B appointment setting via cold
                    calling experience do you have?
                  </>
                }
              >
                <Input
                  id="ps-years"
                  type="number"
                  min={0}
                  step="any"
                  className="h-8 w-20 text-sm"
                  value={phoneForm.yearsExperience}
                  onChange={(e) => setPhone("yearsExperience", e.target.value)}
                />
              </QuestionRow>

              <QuestionRow
                label={
                  <>
                    {qNum(11)}Accent — dialer-voice read-back
                    <AskHint note={ASK_NOTES.accent} />
                  </>
                }
              >
                <YesNoToggle
                  value={phoneForm.accentPass}
                  onChange={(v) => setPhone("accentPass", v)}
                  labels={["Pass", "Fail"]}
                />
              </QuestionRow>

              <QuestionRow
                label={
                  <>
                    {qNum(12)}Equipment
                    <AskHint note={ASK_NOTES.equipment} />
                  </>
                }
              >
                <YesNoToggle
                  value={phoneForm.hasEquipment}
                  onChange={(v) => setPhone("hasEquipment", v)}
                />
              </QuestionRow>

              <QuestionBlock
                htmlFor="ps-notice"
                label={
                  <>
                    {qNum(13)}Notice period{" "}
                    <span className="text-muted-foreground">(phone-confirmed)</span>
                    <AskHint note={ASK_NOTES.notice} />
                  </>
                }
              >
                <Input
                  id="ps-notice"
                  className="h-8 text-sm"
                  placeholder="CV-claimed shows under “From the CV”"
                  value={phoneForm.noticePeriod}
                  onChange={(e) => setPhone("noticePeriod", e.target.value)}
                />
              </QuestionBlock>

              {/* Elena's two end-of-call questions (1 Sep, wording approved
                  by her + Marcus). Logistics facts only — recorded so cover
                  can be planned, NEVER used as a rejection reason. */}
              <QuestionRow
                label={<>{qNum(14)}Do you have any children?</>}
              >
                <YesNoToggle
                  value={phoneForm.hasChildren}
                  onChange={(v) => setPhone("hasChildren", v)}
                />
              </QuestionRow>

              {phoneForm.hasChildren === true && (
                <QuestionRow
                  label={
                    <>
                      <span className="text-muted-foreground">(follow-up)</span>{" "}
                      Do you have care/help with them during working hours
                      (10:00–18:30 SAST)?
                    </>
                  }
                >
                  <YesNoToggle
                    value={phoneForm.childcareSupport}
                    onChange={(v) => setPhone("childcareSupport", v)}
                  />
                </QuestionRow>
              )}

              <QuestionRow
                label={
                  <>
                    {qNum(15)}Do you have any health conditions or disabilities
                    that require reasonable adjustments to your working
                    arrangements?
                  </>
                }
              >
                <YesNoToggle
                  value={phoneForm.healthAdjustments}
                  onChange={(v) => setPhone("healthAdjustments", v)}
                />
              </QuestionRow>

              <QuestionBlock htmlFor="ps-notes" label={<>{qNum(16)}Notes</>}>
                <Textarea
                  id="ps-notes"
                  className="text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes — anything from the call, follow-ups, gut feel…"
                  rows={2}
                />
              </QuestionBlock>

              </>
              )}

              {/* CSV imports have no left pane, so the CV attach sits here. */}
              {compact && cvBlock}
            </div>

            <div className="shrink-0 max-h-[60vh] overflow-y-auto border-t border-border px-5 py-3 space-y-2.5">
              {/* Booking a trial day is what puts this person on the hiring
                  pipeline, so it needs a date and a confirmed email — the CV
                  often has neither. Only shown when Booked is newly picked.
                  No login is sent here; the email is stored and the trialist
                  account is created on the day. */}
              {bookingRequested && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                      Trial day — booking details
                    </p>
                    {lctEvent && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground underline hover:text-primary"
                        onClick={() => {
                          setLctManual((m) => !m);
                          setLctSlot(null);
                          setLctDate("");
                          setLctTime("");
                        }}
                      >
                        {lctManual ? "Use Elena's live availability" : "Enter date/time manually"}
                      </button>
                    )}
                  </div>
                  {lctEvent && !lctManual ? (
                    <div className="space-y-1.5">
                      <BookingSlotPicker
                        eventTypeId={lctEvent.eventTypeId}
                        hostUserId={lctEvent.hostUserId}
                        value={lctSlot}
                        onSelect={(startsAt) => {
                          setLctSlot(startsAt);
                          if (startsAt) {
                            const { date, time } = utcToLondonParts(startsAt);
                            setLctDate(date);
                            setLctTime(time);
                          } else {
                            setLctDate("");
                            setLctTime("");
                          }
                        }}
                      />
                      {lctSlot && (
                        <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          Trial days run Tuesdays and Fridays. Booked onto Elena's calendar on save.
                        </p>
                      )}
                    </div>
                  ) : (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="lct-date" className="text-[11px] text-muted-foreground">
                        Date *
                      </Label>
                      <Input
                        id="lct-date"
                        type="date"
                        className="h-8 text-sm"
                        min={todayIso()}
                        value={lctDate}
                        onChange={(e) => setLctDate(e.target.value)}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label htmlFor="lct-time" className="text-[11px] text-muted-foreground">
                        Time
                      </Label>
                      <Input
                        id="lct-time"
                        type="time"
                        className="h-8 text-sm"
                        value={lctTime}
                        onChange={(e) => setLctTime(e.target.value)}
                      />
                    </div>
                  </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="lct-email" className="text-[11px] text-muted-foreground">
                      Email * {candidate.email ? "(from the CV — confirm on the call)" : "(not on the CV)"}
                    </Label>
                    <Input
                      id="lct-email"
                      type="email"
                      className="h-8 text-sm"
                      value={bookingEmail}
                      onChange={(e) => setBookingEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                  </div>
                </div>
              )}

              {/* Booking against a red verdict needs a short why — it lands
                  in the notes and follows the candidate onto the pipeline. */}
              {reasonRequired && (
                <div className="rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2.5 space-y-1.5">
                  <Label
                    htmlFor="book-reason"
                    className="text-xs font-medium text-red-700 dark:text-red-300"
                  >
                    The framework says Not qualified — give a short reason to
                    book anyway *
                  </Label>
                  <Textarea
                    id="book-reason"
                    className="text-sm bg-background"
                    rows={2}
                    value={bookReason}
                    onChange={(e) => setBookReason(e.target.value)}
                    placeholder="Why is this candidate being booked despite the red verdict?"
                  />
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder="Review status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET_STATUS}>— No status —</SelectItem>
                    {REVIEW_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSave}
                  disabled={!dirty || saving || bookingIncomplete}
                  size="sm"
                  className="h-9 px-5"
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
