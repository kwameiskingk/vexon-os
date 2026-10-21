// The onboarding step template + gating logic. Pure module: no supabase.
//
// The template is the single rendering source for step order, type, links,
// intro copy and question prompts, keyed by task_key. Seeding writes the
// same shape into employee_onboarding_tasks (M7 columns); the renderer
// prefers the DB value and falls back to the template, so rows seeded before
// M7 still render typed and correctly ordered.
//
// One template serves all four target roles in v1. The role parameter exists
// so per-role divergence later is an edit here, not a schema change.
//
// 3 Sep (the owner's rulings R2/R3/R4): the flow is the deck Elena signed off:
// nine pre-start cards, eleven day-one cards (11 Sep: the dashboard
// walkthrough moved to the end of day one and "Your first week" was added),
// then the finish card. Four legacy
// keys are disabled rather than deleted; the mailbox card is a yes/no with an
// email field (step type confirm_email).
//
// 7 Sep (Marcus's 4 Sep review): copy rewritten in a British corporate
// register with no speaker attribution; past-tense done labels; the quiz
// step type and per-card quizzes; several links on one card (link_url holds
// one URL per line). Stays in step with
// supabase/migrations/20260907120000_onboarding_refinement.sql.

export type OnboardingPhase = "pre_start" | "day_one";
export type StepType =
  | "checkoff"
  | "link_confirm"
  | "question"
  // Read an uploaded PDF (SDR Playbook etc.) in the full-screen reader, then
  // confirm. The file lives in the onboarding-assets bucket (docs/…).
  | "read_document"
  // Attach a photo/screenshot as evidence (headset order etc.); saving the
  // upload completes the step and the TA can view it.
  | "upload_proof"
  // 13 Oct (the owner): a professional headshot. Image only; the upload becomes
  // the starter's Vexon OS avatar (profiles.avatar_url) AND a private copy in
  // onboarding-assets so HR can download it for Google Workspace.
  | "profile_photo"
  // "Have you signed into your mailbox?" Yes → type the address → done.
  // No → guidance, card stays open. The typed address is the answer.
  | "confirm_email"
  // A card that is entirely a quiz: opens the full-screen quiz, passing it
  // completes the card (7 Sep). Any OTHER type may also carry a quiz, which
  // then gates completion ("watch the video, then pass the quiz").
  | "quiz";

export const KNOWN_STEP_TYPES: ReadonlySet<string> = new Set([
  "checkoff",
  "link_confirm",
  "question",
  "read_document",
  "upload_proof",
  "profile_photo",
  "confirm_email",
  "quiz",
]);

/* ── Quizzes (7 Sep) ─────────────────────────────────────────────────────── */

export interface QuizQuestion {
  prompt: string;
  options: string[];
  /** Index into options. */
  answer: number;
}

export interface QuizDefinition {
  questions: QuizQuestion[];
  /** Percentage of questions that must be answered correctly. Default 80. */
  pass_mark: number;
}

export const DEFAULT_PASS_MARK = 80;

/** Normalise whatever is stored in the jsonb into a usable quiz, or null. */
export function parseQuiz(raw: unknown): QuizDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { questions?: unknown; pass_mark?: unknown };
  const questions = Array.isArray(o.questions)
    ? o.questions
        .map((q): QuizQuestion | null => {
          if (!q || typeof q !== "object") return null;
          const qq = q as { prompt?: unknown; options?: unknown; answer?: unknown };
          const prompt = typeof qq.prompt === "string" ? qq.prompt.trim() : "";
          const options = Array.isArray(qq.options) ? qq.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
          const answer = Number(qq.answer);
          if (!prompt || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
          return { prompt, options, answer };
        })
        .filter((q): q is QuizQuestion => q !== null)
    : [];
  if (questions.length === 0) return null;
  const pm = Number(o.pass_mark);
  return { questions, pass_mark: Number.isFinite(pm) && pm > 0 && pm <= 100 ? pm : DEFAULT_PASS_MARK };
}

/** How many correct answers pass the quiz. */
export function quizPassCount(quiz: QuizDefinition): number {
  return Math.max(1, Math.ceil((quiz.pass_mark / 100) * quiz.questions.length));
}

export interface OnboardingStepTemplate {
  key: string;
  label: string;
  phase: OnboardingPhase;
  /** 1-based order within the whole flow (pre-start first, then day one). */
  order: number;
  type: StepType;
  /** For link_confirm (and a way-in link on any other type). Null = confirm-only. */
  linkUrl: string | null;
  /** Loom/YouTube URL rendered as the card's media pane. */
  videoUrl?: string | null;
  /** Uploaded media (4 Sep): storage paths in the onboarding-media bucket. */
  thumbnailPath?: string | null;
  videoPath?: string | null;
  /** Explainer that plays full screen BEFORE the card (8 Sep); never the card's own video. */
  introVideoPath?: string | null;
  introVideoUrl?: string | null;
  /** For read_document: storage path (docs/…) in onboarding-assets. */
  documentPath?: string | null;
  /** For question / confirm_email steps. */
  questionPrompt: string | null;
  /** The card's intro copy. */
  description?: string | null;
  /** Past-tense label for the finish card / tracking sheet (7 Sep). */
  doneLabel?: string | null;
  /** A quiz on this card (7 Sep): the whole card when type is quiz, else a gate. */
  quiz?: QuizDefinition | null;
}

export const PHASE_LABELS: Record<OnboardingPhase, string> = {
  pre_start: "Before you start",
  day_one: "Day one",
};

// The real steps (the owner's 3 Sep rulings). Video/handbook/playbook URLs and
// documents are authored in the Dev Center's Onboarding Flow builder; this
// template is the pre-migration fallback and stays in step with
// supabase/migrations/20260903160000_sdr_deck_hr_checklist.sql.
export function onboardingTemplate(_targetRole: string | null): OnboardingStepTemplate[] {
  return [
    // ── Pre-start (mandatory before Day 1) ──────────────────────────────
    {
      key: "setup_gmail",
      label: "Confirm your Meridian mailbox",
      phase: "pre_start",
      order: 1,
      type: "confirm_email",
      linkUrl: null,
      questionPrompt: "Have you signed in to your new Meridian mailbox and set your password?",
      description:
        "Completing everything in \"Before you start\" ahead of your first day is a condition of starting with us. Welcome to Meridian. A Google Workspace invitation has been sent to your personal email address. Once you have signed in and set your password, please enter your new address below.",
      doneLabel: "Meridian mailbox confirmed",
    },
    {
      key: "setup_dashboard",
      label: "Sign in to your dashboard",
      phase: "pre_start",
      order: 3,
      type: "checkoff",
      linkUrl: null,
      questionPrompt: null,
      description: "You are already here, so this one is straightforward. Take a moment to look around, then confirm that you have signed in.",
      doneLabel: "Signed in to the dashboard",
    },
    {
      key: "read_handbook",
      label: "Read the Employee Onboarding Handbook",
      phase: "pre_start",
      order: 5,
      type: "read_document",
      linkUrl: null,
      questionPrompt: null,
      description: "The handbook covers how we work, from working hours to holidays. Please open it, read it in full, then confirm below.",
      doneLabel: "Employee Onboarding Handbook read",
    },
    {
      key: "order_headset",
      label: "Order your headset",
      phase: "pre_start",
      order: 6,
      type: "upload_proof",
      linkUrl:
        "https://www.amazon.co.uk/dp/B00O1A9FT2\nhttps://www.amazon.co.za/dp/B0BSG58YKK\nhttps://www.takealot.com/jabra-evolve-20-headset-with-mic/PLID46643261",
      questionPrompt: null,
      description:
        "Please order the Jabra Evolve 20 headset using the link for your country below. The cost is reimbursed in full, so keep your receipt. Once your order has been placed, upload a screenshot of the order confirmation here.",
      doneLabel: "Headset ordered",
    },
    {
      key: "optimise_whatsapp",
      label: "Set up WhatsApp Business",
      phase: "pre_start",
      order: 7,
      type: "checkoff",
      linkUrl: null,
      // 2 Oct (the owner): the setup walkthrough plays on the card as a real
      // <video> shipped with the app (the YouTube owner blocks embedding), so
      // the card can switch to the action by itself when it ends.
      videoPath: "/onboarding/whatsapp-business-setup.mp4",
      questionPrompt: null,
      description:
        "We use WhatsApp Business to communicate with candidates and clients. Watch the video, install WhatsApp Business on your phone and complete your profile with your work details, then mark this card as complete.",
      doneLabel: "WhatsApp Business set up",
    },
    {
      key: "optimise_linkedin",
      label: "Update your LinkedIn profile",
      phase: "pre_start",
      order: 8,
      type: "question",
      linkUrl: "https://vexon-os.example/onboarding/linkedin-banner-placeholder.png",
      questionPrompt: "Paste the link to your updated LinkedIn profile.",
      description:
        "Your LinkedIn profile is the first thing a prospect will check. Update your headline and current role to Meridian, add a clear, professional photograph, and use the Meridian banner (download it below). The example profile shown here is the standard to aim for. Then paste the link to your profile below.",
      doneLabel: "LinkedIn profile updated",
    },
    {
      key: "accept_meetings",
      label: "Accept your first-day meeting invitations",
      phase: "pre_start",
      order: 9,
      type: "link_confirm",
      linkUrl: "https://calendar.google.com",
      questionPrompt: null,
      description:
        "Your first-day meetings have already been added to your new calendar. Please open Google Calendar, accept every invitation, then confirm here.",
      doneLabel: "First-day meeting invitations accepted",
    },
    {
      key: "speed_test",
      label: "Run an internet speed test",
      phase: "pre_start",
      order: 10,
      type: "upload_proof",
      linkUrl: "https://www.speedtest.net/",
      questionPrompt: null,
      description:
        "Clear calls depend on a reliable connection. We recommend a fibre connection with at least 10 Mbps upload and download. Please run the test on the computer you will work from and upload a screenshot of the result.",
      doneLabel: "Internet speed test completed",
    },
    {
      key: "upload_profile_photo",
      label: "Upload your profile photo",
      phase: "pre_start",
      order: 11,
      type: "profile_photo",
      linkUrl: null,
      questionPrompt: null,
      // 13 Oct (the owner): firm, not pandering. The photo is used for the Google
      // Workspace account, the email signature and the Vexon OS profile.
      description:
        "You are required to upload a professional headshot before your first day. We use it for your Google Workspace account, your email signature and your Vexon OS profile, so it must be a clear, recent, front-facing photograph of you alone, on a plain background, in work-appropriate clothing. No group photos, no filters, no sunglasses, no cropped-out people. This is a condition of starting with us.",
      doneLabel: "Profile photo uploaded",
    },
    // ── Day one ─────────────────────────────────────────────────────────
    {
      key: "attend_hr_morning",
      label: "Attend the morning HR meeting",
      phase: "day_one",
      order: 11,
      type: "checkoff",
      linkUrl: null,
      questionPrompt: null,
      description:
        "Good morning and welcome back, {first_name}. Your first day begins with a short meeting with HR. Once that meeting is complete, please mark this task as complete and continue to the next.",
      doneLabel: "Morning HR meeting attended",
    },
    {
      key: "attend_manager_1_1",
      label: "Attend your one-to-one with your manager",
      phase: "day_one",
      order: 12,
      type: "checkoff",
      linkUrl: null,
      questionPrompt: null,
      description:
        "Your manager will take you through your targets, your first clients and the shape of the week ahead. Please confirm once the meeting has taken place.",
      doneLabel: "One-to-one with your manager attended",
    },
    {
      key: "confirm_close_access",
      label: "Set up Close CRM",
      phase: "day_one",
      order: 13,
      type: "checkoff",
      linkUrl: null,
      // 6 Oct (the owner and Elena): Jordan's Close walkthrough plays here; the
      // pre-start Close intro card is gone (they log in on day one).
      videoPath: "/onboarding/sdr/setup-close-crm.mp4",
      questionPrompt: null,
      description:
        "Your Close invitation will arrive this morning. Please accept it, purchase your phone number and allow microphone access when your browser prompts you.",
      doneLabel: "Close CRM set up",
    },
    {
      key: "watch_cold_calling_videos",
      label: "Watch the cold-calling videos",
      phase: "day_one",
      order: 15,
      type: "checkoff",
      linkUrl: null,
      questionPrompt: null,
      description:
        "Six modules from Grant Cardone's Mastering the Cold Call. Work through them in order: each module unlocks once you have watched every video in the one before. When all six are done, mark this card as complete.",
      doneLabel: "Cold-calling videos watched",
    },
    {
      key: "watch_recruitment_videos",
      label: "Watch the recruitment videos",
      phase: "day_one",
      order: 16,
      type: "checkoff",
      linkUrl: null,
      // 16 Oct (the owner): the new recruitment training call (Marcus, Daniel,
      // Zolani) replaces the 6 Oct recording.
      videoPath: "/onboarding/sdr/recruitment-training-2026-10-16.mp4",
      questionPrompt: null,
      description: "An introduction to the recruitment industry: the roles, the terminology and what matters to our clients.",
      doneLabel: "Recruitment videos watched",
    },
    {
      key: "watch_dashboard_video",
      label: "Watch: getting around your dashboard",
      phase: "day_one",
      order: 21,
      type: "checkoff",
      linkUrl: null,
      // 5 Oct (the owner): the Vexon OS explainer ships with the app at 720p, the
      // same way as the WhatsApp card, so the card opens as the video and
      // switches to its action when it ends. Draft v2 until the final cut.
      videoPath: "/onboarding/vexon-explainer.mp4",
      questionPrompt: null,
      description:
        "You are about to move into Vexon OS proper. This short walkthrough shows where everything lives: your appointments, your booking links, your metrics and your resources. Watch it in full, then mark this card as complete to open your dashboard.",
      doneLabel: "Dashboard walkthrough watched",
    },
  ];
}

/** A task row's fields relevant to rendering (DB shape, possibly pre-M7). */
export interface TaskLike {
  id: string;
  stage: string;
  task_key: string;
  task_label: string;
  is_completed: boolean | null;
  completed_at?: string | null;
  sort_order?: number | null;
  step_type?: string | null;
  link_url?: string | null;
  video_url?: string | null;
  document_path?: string | null;
  proof_path?: string | null;
  question_prompt?: string | null;
  answer_text?: string | null;
  description?: string | null;
}

/** A task merged with the template: everything the deck needs. */
export interface ResolvedStep {
  taskId: string;
  key: string;
  label: string;
  phase: OnboardingPhase;
  order: number;
  type: StepType;
  linkUrl: string | null;
  videoUrl: string | null;
  thumbnailPath: string | null;
  videoPath: string | null;
  introVideoPath: string | null;
  introVideoUrl: string | null;
  documentPath: string | null;
  proofPath: string | null;
  questionPrompt: string | null;
  description: string | null;
  doneLabel: string | null;
  quiz: QuizDefinition | null;
  done: boolean;
  answer: string | null;
}

const PHASE_RANK: Record<string, number> = { pre_start: 0, day_one: 1 };

/**
 * Merge DB rows with the template (DB value wins when present) and return
 * the full flow, sorted pre-start first, then day one, by order. Rows whose
 * task_key isn't in the template still render (as checkoffs, after the
 * templated steps of their phase) — nothing is ever hidden.
 *
 * `liveTemplates` (7 Sep) is the builder table as read by the viewer: it
 * carries what the task snapshot does not — uploaded media, quizzes and
 * done labels — and beats the code template key by key.
 */
export function resolveSteps(
  tasks: TaskLike[],
  targetRole: string | null,
  liveTemplates?: OnboardingStepTemplate[] | null,
): ResolvedStep[] {
  const template = new Map(onboardingTemplate(targetRole).map((s) => [s.key, s]));
  for (const t of liveTemplates ?? []) template.set(t.key, { ...template.get(t.key), ...t });
  return tasks
    .map((t) => {
      const tpl = template.get(t.task_key);
      const phase: OnboardingPhase = t.stage === "day_one" ? "day_one" : "pre_start";
      return {
        taskId: t.id,
        key: t.task_key,
        label: t.task_label || tpl?.label || t.task_key,
        // The seeded row's phase is authoritative (the flow builder may have
        // moved a step); the template only fills in for pre-M7 rows.
        phase: t.stage === "day_one" || t.stage === "pre_start" ? phase : tpl?.phase ?? phase,
        order: t.sort_order ?? tpl?.order ?? 999,
        type: (t.step_type && KNOWN_STEP_TYPES.has(t.step_type)
          ? (t.step_type as StepType)
          : tpl?.type) ?? "checkoff",
        linkUrl: t.link_url ?? tpl?.linkUrl ?? null,
        videoUrl: t.video_url ?? tpl?.videoUrl ?? null,
        // Media lives on the template only: swapping a video re-points every
        // starter's card, which is what Elena expects when she uploads one.
        thumbnailPath: tpl?.thumbnailPath ?? null,
        videoPath: tpl?.videoPath ?? null,
        introVideoPath: tpl?.introVideoPath ?? null,
        introVideoUrl: tpl?.introVideoUrl ?? null,
        documentPath: t.document_path ?? tpl?.documentPath ?? null,
        proofPath: t.proof_path ?? null,
        questionPrompt: t.question_prompt ?? tpl?.questionPrompt ?? null,
        description: t.description ?? tpl?.description ?? null,
        doneLabel: tpl?.doneLabel ?? null,
        quiz: tpl?.quiz ?? null,
        done: t.is_completed === true,
        answer: t.answer_text ?? null,
      };
    })
    .sort(
      (a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || a.order - b.order,
    );
}

/** Turn a template (DB flow or code fallback) into synthetic, unsaved steps. */
export function stepsFromTemplate(template: OnboardingStepTemplate[]): ResolvedStep[] {
  return template
    .map((s) => ({
      taskId: `template-${s.key}`,
      key: s.key,
      label: s.label,
      phase: s.phase,
      order: s.order,
      type: s.type,
      linkUrl: s.linkUrl,
      videoUrl: s.videoUrl ?? null,
      thumbnailPath: s.thumbnailPath ?? null,
      videoPath: s.videoPath ?? null,
      introVideoPath: s.introVideoPath ?? null,
      introVideoUrl: s.introVideoUrl ?? null,
      documentPath: s.documentPath ?? null,
      proofPath: null,
      questionPrompt: s.questionPrompt,
      description: s.description ?? null,
      doneLabel: s.doneLabel ?? null,
      quiz: s.quiz ?? null,
      done: false,
      answer: null,
    }))
    .sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || a.order - b.order);
}

/**
 * Hard gating: the flow is strictly sequential. The current step is the
 * first incomplete one; everything after it is locked. Because pre-start
 * sorts entirely before day one, day one is locked until pre-start is done.
 */
export function currentStepIndex(steps: ResolvedStep[]): number {
  const i = steps.findIndex((s) => !s.done);
  return i === -1 ? steps.length : i;
}

export interface PhaseProgress {
  done: number;
  total: number;
}

/**
 * Turn a pasted Loom / YouTube share URL into its embeddable form. Any other
 * URL returns null — the step then just shows its link, never a broken
 * iframe.
 */
export function embedUrlFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const loom = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const ytWatch = url.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;
  const ytShort = url.match(/youtu\.be\/([\w-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  const ytEmbed = url.match(/youtube\.com\/embed\/([\w-]+)/);
  if (ytEmbed) return url;
  return null;
}

export function phaseProgress(steps: ResolvedStep[]): Record<OnboardingPhase, PhaseProgress> {
  const out: Record<OnboardingPhase, PhaseProgress> = {
    pre_start: { done: 0, total: 0 },
    day_one: { done: 0, total: 0 },
  };
  for (const s of steps) {
    out[s.phase].total += 1;
    if (s.done) out[s.phase].done += 1;
  }
  return out;
}
