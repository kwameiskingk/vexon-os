// Per-type step bodies for the SDR (new starter) onboarding deck (3 Sep).
// Presentational plus the minimum wiring each type needs. Completion is the
// caller's job (useCompleteStep on the live deck, in-memory state in the
// sandbox); bodies only call ctx.onComplete with the answer / proof path.
//
// Types: checkoff, link_confirm (open the link, then confirm), question
// (typed answer), read_document (the PDF inline, then confirm), upload_proof
// (drag-drop, one file), confirm_email (the mailbox yes/no card, R2), and
// quiz (7 Sep: the whole card is a full-screen quiz). Any card may also
// carry a quiz, which then gates completion: the universal button becomes
// "Take the quiz".
//
// 7 Sep: no speakers. The card speaks; copy is British corporate. A link
// field may hold several URLs (one per line) and renders one button each,
// which is how the headset card offers Amazon and Takealot.
//
// 11 Sep (Marcus's 8 Sep walkthrough): no body draws its own advance
// button; each registers the card's universal "Mark complete · next task"
// through usePrimaryAction. The handbook reads inline instead of popping out.

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Camera,
  Check,
  ExternalLink,
  FileText,
  PlayCircle,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { embedUrlFor, type ResolvedStep } from "@/lib/onboardingSteps";
import { signedAssetUrl, uploadProfilePhoto, uploadProofFile } from "@/hooks/useOnboardingFlow";
import { FileChips, FileDropZone, fileLabel, primaryBtn, secondaryBtn } from "@/components/client-onboarding/JourneySteps";
import { usePrimaryAction } from "./CardAction";
import { InlineDocument } from "./InlineDocument";
import { TrainingModulesStep } from "./TrainingModules";
import { trainingModulesFor } from "@/lib/sdrTrainingModules";
import { QuizDialog, type QuizResult } from "./QuizDialog";
import { linkLabel, splitLinks } from "./copy";

export interface SdrCompletePayload {
  answer?: string;
  proofPath?: string;
}

export interface SdrCtx {
  completing: boolean;
  onComplete: (payload?: SdrCompletePayload) => void;
  /** complete → the live card; edit → the deck's Previous → "Edit and save again" (11 Sep). */
  mode?: "complete" | "edit";
  onCancelEdit?: () => void;
  /** Sandbox: uploads keep only the filename, nothing is written. */
  sandbox?: boolean;
  /** The starter's auth id, for the proof/{userId}/ storage prefix. */
  userId?: string | null;
}

const inputCls = "bg-white border-violet-200/80 focus-visible:ring-violet-500 h-11 text-[15px]";

/** Cards whose answer can be changed after completion (the deck's Previous → Edit). */
const EDITABLE_SDR_TYPES = ["question", "confirm_email", "upload_proof", "profile_photo"];
export const isEditableSdrType = (t: string) => EDITABLE_SDR_TYPES.includes(t);

/** Edit mode relabels the universal button and adds a quiet Cancel beside it. */
function editExtras(ctx: SdrCtx) {
  if (ctx.mode !== "edit") return {};
  return {
    label: "Save changes",
    secondary: ctx.onCancelEdit ? { label: "Cancel", onClick: ctx.onCancelEdit } : null,
  };
}

/** The row two side-by-side actions share (the owner, 7 Sep: they were touching). */
export const actionRow = "flex flex-wrap items-center gap-4";

export function SdrStepBody({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  return (
    <div className="space-y-5">
      <MediaFallbacks step={step} />
      <TypedBody step={step} ctx={ctx} />
    </div>
  );
}

/** A video that isn't embeddable, or way-in links on a non-link step. */
function MediaFallbacks({ step }: { step: ResolvedStep }) {
  const videoLink = step.videoUrl && !embedUrlFor(step.videoUrl) ? step.videoUrl : null;
  const wayIn = step.type !== "link_confirm" ? splitLinks(step.linkUrl) : [];
  if (!videoLink && wayIn.length === 0) return null;
  return (
    <div className={actionRow}>
      {videoLink && (
        <a href={videoLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:underline">
          <PlayCircle className="h-4 w-4" /> Watch the video <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {wayIn.map((url) => (
        <LinkButton key={url} url={url} />
      ))}
    </div>
  );
}

function LinkButton({ url, onOpen }: { url: string; onOpen?: () => void }) {
  const label = linkLabel(url);
  const shop = /^Order on/.test(label);
  return (
    <Button asChild variant="outline" className={secondaryBtn}>
      <a href={url} target="_blank" rel="noreferrer" onClick={onOpen}>
        {shop ? <ShoppingCart className="h-4 w-4 mr-1.5" /> : <ExternalLink className="h-4 w-4 mr-1.5" />}
        {label}
      </a>
    </Button>
  );
}

function TypedBody({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  // 6 Oct: a card with training modules plays as a short course.
  const modules = trainingModulesFor(step.key);
  if (modules) {
    return (
      <TrainingModulesStep
        stepKey={step.key}
        modules={modules}
        done={step.done}
        completing={ctx.completing}
        onComplete={() => ctx.onComplete()}
        sandbox={ctx.sandbox}
        userId={ctx.userId}
      />
    );
  }
  switch (step.type) {
    case "link_confirm":
      return <LinkConfirmStep step={step} ctx={ctx} />;
    case "question":
      return <QuestionStep step={step} ctx={ctx} />;
    case "confirm_email":
      return <ConfirmEmailStep step={step} ctx={ctx} />;
    case "read_document":
      return <ReadDocumentStep step={step} ctx={ctx} />;
    case "upload_proof":
      return <UploadProofStep step={step} ctx={ctx} />;
    case "profile_photo":
      return <ProfilePhotoStep step={step} ctx={ctx} />;
    case "quiz":
      return <QuizStep step={step} ctx={ctx} whole />;
    case "checkoff":
    default:
      if (step.quiz) return <QuizStep step={step} ctx={ctx} />;
      return <CheckoffStep ctx={ctx} />;
  }
}

/** A card with nothing to fill in: the universal button completes it. */
function CheckoffStep({ ctx }: { ctx: SdrCtx }) {
  usePrimaryAction({ onClick: () => ctx.onComplete(), busy: ctx.completing });
  return null;
}

/* ── Quiz (7 Sep) ────────────────────────────────────────────────────────── */

export const quizAnswer = (r: QuizResult) => `Quiz passed: ${r.correct} of ${r.total} correct`;

function QuizStep({ step, ctx, whole }: { step: ResolvedStep; ctx: SdrCtx; whole?: boolean }) {
  const [open, setOpen] = useState(false);
  const n = step.quiz?.questions.length ?? 0;

  // Passing the quiz is what completes the card, so the universal button
  // opens it (the one label exception). Without a quiz yet, it completes.
  usePrimaryAction(
    step.quiz
      ? { onClick: () => setOpen(true), label: whole ? "Start the quiz" : "Take the quiz", busy: ctx.completing }
      : { onClick: () => ctx.onComplete(), busy: ctx.completing },
  );

  if (!step.quiz) {
    return (
      <p className="text-sm text-muted-foreground">
        {whole
          ? "The quiz for this card has not been added yet. You may mark it complete to continue."
          : "Please mark this complete once you have finished this step."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {whole
          ? `A short quiz of ${n} question${n === 1 ? "" : "s"}. Passing it completes this card.`
          : `Once you have watched the video, a short quiz of ${n} question${n === 1 ? "" : "s"} checks that the key points have landed. Passing it completes this card.`}
      </p>
      <QuizDialog
        open={open}
        onOpenChange={setOpen}
        title={step.label}
        quiz={step.quiz}
        confirming={ctx.completing}
        onPass={(r) => {
          setOpen(false);
          ctx.onComplete({ answer: quizAnswer(r) });
        }}
      />
    </div>
  );
}

/* ── Link, then confirm ──────────────────────────────────────────────────── */

function LinkConfirmStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [opened, setOpened] = useState(false);
  const links = splitLinks(step.linkUrl);
  usePrimaryAction({
    onClick: () => ctx.onComplete(),
    disabled: links.length > 0 && !opened,
    busy: ctx.completing,
    hint: links.length > 0 && !opened ? "Open the link first, then come back and mark this complete." : null,
  });
  if (links.length === 0) {
    return <p className="text-sm text-muted-foreground">The link will appear here once it has been added. Please mark this complete once you have done this step.</p>;
  }
  return (
    <div className={actionRow}>
      {links.map((url) => (
        <LinkButton key={url} url={url} onOpen={() => setOpened(true)} />
      ))}
    </div>
  );
}

/* ── Question ────────────────────────────────────────────────────────────── */

function QuestionStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [draft, setDraft] = useState(step.answer ?? "");
  const wantsUrl = /url|link/i.test(step.questionPrompt ?? "");
  const value = draft.trim();
  const valid = value.length > 0 && (!wantsUrl || /^https?:\/\/\S+/i.test(value) || /linkedin\.com\//i.test(value));
  const submit = () => {
    if (!valid) return;
    ctx.onComplete({ answer: value });
  };
  usePrimaryAction({
    onClick: submit,
    disabled: !valid,
    busy: ctx.completing,
    hint: !value ? "Type your answer above." : !valid ? "Please paste the full link, beginning with https://" : null,
    ...editExtras(ctx),
  });
  return (
    <div className="space-y-3">
      {step.questionPrompt && <p className="text-lg font-medium font-heading">{step.questionPrompt}</p>}
      <Input
        type={wantsUrl ? "url" : "text"}
        className={cn(inputCls, "max-w-xl")}
        value={draft}
        placeholder={wantsUrl ? "https://www.linkedin.com/in/your-name" : "Type your answer"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
    </div>
  );
}

/* ── Confirm mailbox (yes / no + email) ──────────────────────────────────── */

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function ConfirmEmailStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(ctx.mode === "edit" ? "yes" : null);
  const [email, setEmail] = useState(step.answer ?? "");
  const value = email.trim().toLowerCase();
  const valid = isEmail(value);
  const offDomain = valid && !value.endsWith("@meridiansales.example") && !value.endsWith("@meridiansales.example");
  const submit = () => {
    if (!valid) return;
    ctx.onComplete({ answer: value });
  };
  usePrimaryAction({
    onClick: submit,
    disabled: answer !== "yes" || !valid,
    busy: ctx.completing,
    hint: answer !== "yes" ? "Choose an answer above." : !valid ? "Type your new address." : null,
    ...editExtras(ctx),
  });

  return (
    <div className="space-y-4">
      <p className="text-lg font-medium font-heading">
        {step.questionPrompt ?? "Have you signed in to your new Meridian mailbox and set your password?"}
      </p>
      <div className={actionRow}>
        <Button
          size="lg"
          className={cn("rounded-full px-6", answer === "yes" ? primaryBtn : secondaryBtn)}
          onClick={() => setAnswer("yes")}
          disabled={ctx.completing}
        >
          <Check className="h-4 w-4 mr-2" /> Yes, I have signed in
        </Button>
        <Button
          size="lg"
          className={cn("rounded-full px-6", secondaryBtn, answer === "no" && "bg-violet-50")}
          onClick={() => setAnswer("no")}
          disabled={ctx.completing}
        >
          Not yet
        </Button>
      </div>

      {answer === "no" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Please check your personal inbox for the Google Workspace invitation. Follow the link, set your password, then return here and select Yes. This card remains open until you do.
        </motion.div>
      )}

      {answer === "yes" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <label className="block text-sm font-medium">Your new address</label>
          <Input
            type="email"
            className={cn(inputCls, "max-w-xl")}
            value={email}
            placeholder="you@meridiansales.example"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          {offDomain && (
            <p className="text-xs text-amber-700">This does not appear to be a Meridian address. Please check it before confirming.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ── Read document (inline, 11 Sep) ─────────────────────────────────────── */

function ReadDocumentStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (step.documentPath) {
      signedAssetUrl(step.documentPath)
        .then((u) => { if (!cancelled) setUrl(u); })
        .catch(() => { if (!cancelled) setFailed(true); });
    }
    return () => { cancelled = true; };
  }, [step.documentPath]);

  usePrimaryAction({
    onClick: () => ctx.onComplete(),
    busy: ctx.completing,
    hint: step.documentPath ? "Scroll through the whole document, then mark this complete." : null,
  });

  if (!step.documentPath) {
    return <p className="text-sm text-muted-foreground">The document will appear here once it has been added. You may still mark this complete once you have read it elsewhere.</p>;
  }
  return (
    <InlineDocument
      title={step.label}
      url={url}
      loading={!url && !failed}
      error={failed ? "The document could not be loaded. Please let Elena know, then confirm once you have read it another way." : null}
    />
  );
}

/* ── Upload proof ────────────────────────────────────────────────────────── */

function UploadProofStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [path, setPath] = useState<string | null>(step.proofPath);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  usePrimaryAction({
    onClick: () => { if (path) ctx.onComplete({ proofPath: path }); },
    disabled: !path || busy,
    busy: ctx.completing,
    hint: !path ? "Upload your proof first." : null,
    ...editExtras(ctx),
  });

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setErr(null);
    if (ctx.sandbox) {
      // Sandbox: the file never leaves the browser; only its name is kept.
      setPath(`sandbox/${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80)}`);
      return;
    }
    if (!ctx.userId) {
      setErr("You need to be signed in to upload.");
      return;
    }
    setBusy(true);
    try {
      setPath(await uploadProofFile(file, ctx.userId, step.taskId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <FileDropZone accept="image/*,.pdf" busy={busy} onFiles={onFiles} hint="A photo, screenshot or PDF" />
      <FileChips paths={path ? [path] : []} onRemove={() => setPath(null)} />
      {err && <p className="text-sm text-red-500">{err}</p>}
    </div>
  );
}

/* ── Profile photo (13 Oct) ──────────────────────────────────────────────── */

const PHOTO_RULES = [
  "You, alone, facing the camera",
  "Plain background, good light",
  "Work-appropriate clothing",
  "No filters, no sunglasses, no group shots",
];

function ProfilePhotoStep({ step, ctx }: { step: ResolvedStep; ctx: SdrCtx }) {
  const [path, setPath] = useState<string | null>(step.proofPath);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A previously uploaded photo (edit mode / reload mid-card) previews from
  // its signed private copy.
  useEffect(() => {
    if (!step.proofPath || ctx.sandbox) return;
    let live = true;
    signedAssetUrl(step.proofPath)
      .then((u) => { if (live) setPreview(u); })
      .catch(() => { /* preview is a nicety; the chip still shows the file */ });
    return () => { live = false; };
  }, [step.proofPath, ctx.sandbox]);

  usePrimaryAction({
    onClick: () => { if (path) ctx.onComplete({ proofPath: path }); },
    disabled: !path || busy,
    busy: ctx.completing,
    hint: !path ? "Upload your photo first." : null,
    ...editExtras(ctx),
  });

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("That is not an image. Upload a JPG or PNG photograph.");
      return;
    }
    const local = URL.createObjectURL(file);
    if (ctx.sandbox) {
      setPreview(local);
      setPath(`sandbox/${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80)}`);
      return;
    }
    if (!ctx.userId) {
      setErr("You need to be signed in to upload.");
      return;
    }
    setBusy(true);
    try {
      const { proofPath } = await uploadProfilePhoto(file, ctx.userId);
      setPreview(local);
      setPath(proofPath);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div
          className={cn(
            "h-28 w-28 shrink-0 rounded-full overflow-hidden border-2 flex items-center justify-center bg-white",
            preview ? "border-violet-400" : "border-dashed border-violet-300",
          )}
        >
          {preview ? (
            <img src={preview} alt="Your profile photo" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-8 w-8 text-violet-300" />
          )}
        </div>
        <ul className="text-sm text-muted-foreground space-y-1">
          {PHOTO_RULES.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </div>
      <FileDropZone
        accept="image/*"
        busy={busy}
        onFiles={onFiles}
        hint={path ? "Drop a different photo to replace it" : "A JPG or PNG photograph, under 5 MB"}
      />
      <FileChips paths={path ? [path] : []} onRemove={() => { setPath(null); setPreview(null); }} />
      {err && <p className="text-sm text-red-500">{err}</p>}
    </div>
  );
}

/* ── Review-mode summary (deck "Previous") ───────────────────────────────── */

export function sdrStepSummary(step: ResolvedStep): string[] {
  switch (step.type) {
    case "question":
    case "confirm_email":
      return step.answer ? [step.answer] : ["Complete"];
    case "upload_proof":
      return step.proofPath ? [`Proof uploaded: ${fileLabel(step.proofPath)}`] : ["Complete"];
    case "profile_photo":
      return step.proofPath ? ["Profile photo uploaded"] : ["Complete"];
    case "read_document":
      return ["Read and confirmed"];
    case "quiz":
      return step.answer ? [step.answer] : ["Quiz passed"];
    default:
      return step.answer ? [step.answer] : ["Complete"];
  }
}

/** "View proof" link for a finished upload card (signs the private path). */
export function ProofLink({ path, sandbox }: { path: string; sandbox?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  if (sandbox) return null;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(false);
          try {
            window.open(await signedAssetUrl(path), "_blank", "noopener");
          } catch {
            setErr(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileText className="h-4 w-4" /> View what you uploaded <ExternalLink className="h-3.5 w-3.5" />
      </button>
      {err && <p className="text-xs text-red-500">The file could not be opened just now.</p>}
    </div>
  );
}
