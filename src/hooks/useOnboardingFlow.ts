// The DB-driven onboarding flow (Run 3): onboarding_step_templates rows ARE
// the flow new starters get. Authored in the Dev Center's Onboarding Flow
// module; read at seeding time by the TA's create-profile mutation. Falls
// back to the code template in src/lib/onboardingSteps.ts until the
// 2026-08-18-onboarding-flow-builder.sql migration is run (or if the table
// is emptied), so provisioning never breaks.
//
// The starter never reads this table — their steps are copied into
// employee_onboarding_tasks at seed time (video_url, document_path and, from
// 3 Sep, description included), which they already read under the "views
// own tasks" policy.
//
// Column probing: description (3 Sep) → document_path (19 Aug) → base. Each
// missing column only switches off its own feature.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withMigrationGuard } from "@/lib/migrationGuard";
import { KNOWN_STEP_TYPES, parseQuiz, type OnboardingStepTemplate, type QuizDefinition } from "@/lib/onboardingSteps";

export const ONBOARDING_FLOW_QUERY_KEY = ["onboarding-flow-templates"] as const;

export interface OnboardingFlowRow {
  id: string;
  step_key: string;
  label: string;
  phase: string;
  step_type: string;
  link_url: string | null;
  video_url: string | null;
  /** Only present once the 2026-08-19 docs migration is applied. */
  document_path?: string | null;
  /** Only present once the 3 Sep deck migration is applied. */
  description?: string | null;
  /** Only present once the 4 Sep media migration is applied. */
  thumbnail_path?: string | null;
  video_path?: string | null;
  /** Only present once the 7 Sep refinement migration is applied. */
  done_label?: string | null;
  quiz?: unknown;
  /** Only present once the 8 Sep intro-video migration is applied. */
  intro_video_path?: string | null;
  intro_video_url?: string | null;
  question_prompt: string | null;
  sort_order: number;
  enabled: boolean;
}

const SELECT_COLUMNS =
  "id, step_key, label, phase, step_type, link_url, video_url, question_prompt, sort_order, enabled";
const SELECT_COLUMNS_WITH_DOCS = `${SELECT_COLUMNS}, document_path`;
const SELECT_COLUMNS_WITH_DESC = `${SELECT_COLUMNS_WITH_DOCS}, description`;
const SELECT_COLUMNS_WITH_MEDIA = `${SELECT_COLUMNS_WITH_DESC}, thumbnail_path, video_path`;
const SELECT_COLUMNS_WITH_QUIZ = `${SELECT_COLUMNS_WITH_MEDIA}, done_label, quiz`;
const SELECT_COLUMNS_WITH_INTRO = `${SELECT_COLUMNS_WITH_QUIZ}, intro_video_path, intro_video_url`;

export interface FlowTemplatesResult {
  data: OnboardingFlowRow[];
  migrationPending: boolean;
  /** 2026-08-19 docs migration applied — document/proof steps available. */
  docsReady: boolean;
  /** 3 Sep deck migration applied — description + confirm_email available. */
  descReady: boolean;
  /** 4 Sep media migration applied — uploaded thumbnails and videos available. */
  mediaReady: boolean;
  /** 7 Sep refinement migration applied — quizzes and done labels available. */
  quizReady: boolean;
  /** 8 Sep intro-video migration applied — explainer video fields available. */
  introReady: boolean;
}

type Shape = { columns: string; docsReady: boolean; descReady: boolean; mediaReady: boolean; quizReady: boolean; introReady: boolean };
const SHAPES: Shape[] = [
  { columns: SELECT_COLUMNS_WITH_INTRO, docsReady: true, descReady: true, mediaReady: true, quizReady: true, introReady: true },
  { columns: SELECT_COLUMNS_WITH_QUIZ, docsReady: true, descReady: true, mediaReady: true, quizReady: true, introReady: false },
  { columns: SELECT_COLUMNS_WITH_MEDIA, docsReady: true, descReady: true, mediaReady: true, quizReady: false, introReady: false },
  { columns: SELECT_COLUMNS_WITH_DESC, docsReady: true, descReady: true, mediaReady: false, quizReady: false, introReady: false },
  { columns: SELECT_COLUMNS_WITH_DOCS, docsReady: true, descReady: false, mediaReady: false, quizReady: false, introReady: false },
  { columns: SELECT_COLUMNS, docsReady: false, descReady: false, mediaReady: false, quizReady: false, introReady: false },
];

async function probeTemplates(enabledOnly: boolean): Promise<FlowTemplatesResult> {
  for (const shape of SHAPES) {
    const result = await withMigrationGuard<OnboardingFlowRow[]>(
      () => {
        let q = supabase.from("onboarding_step_templates" as never).select(shape.columns);
        if (enabledOnly) q = q.eq("enabled", true);
        return q.order("phase").order("sort_order") as never;
      },
      [],
    );
    if (!result.migrationPending) {
      return { ...result, docsReady: shape.docsReady, descReady: shape.descReady, mediaReady: shape.mediaReady, quizReady: shape.quizReady, introReady: shape.introReady };
    }
  }
  return { data: [], migrationPending: true, docsReady: false, descReady: false, mediaReady: false, quizReady: false, introReady: false };
}

/** All template rows (including disabled), for the Dev Center editor. */
export function useOnboardingFlowTemplates() {
  return useQuery({
    queryKey: ONBOARDING_FLOW_QUERY_KEY,
    staleTime: 30_000,
    queryFn: () => probeTemplates(false),
  });
}

export function rowToTemplate(r: OnboardingFlowRow): OnboardingStepTemplate {
  return {
    key: r.step_key,
    label: r.label,
    phase: r.phase === "day_one" ? "day_one" : "pre_start",
    order: r.sort_order,
    type: (KNOWN_STEP_TYPES.has(r.step_type) ? r.step_type : "checkoff") as OnboardingStepTemplate["type"],
    linkUrl: r.link_url,
    videoUrl: r.video_url,
    documentPath: r.document_path,
    thumbnailPath: r.thumbnail_path ?? null,
    videoPath: r.video_path ?? null,
    introVideoPath: r.intro_video_path ?? null,
    introVideoUrl: r.intro_video_url ?? null,
    questionPrompt: r.question_prompt,
    description: r.description,
    doneLabel: r.done_label ?? null,
    quiz: parseQuiz(r.quiz),
  };
}

/**
 * The enabled flow, fetched imperatively at seeding time (and by the
 * sandbox). Returns null when the table is missing OR empty — the caller
 * then falls back to the code template exactly as before the builder existed.
 */
export async function fetchOnboardingFlow(): Promise<OnboardingStepTemplate[] | null> {
  return (await fetchOnboardingFlowDetailed()).steps;
}

export interface OnboardingFlowFetch {
  /** The enabled flow, or null when the table is missing or returned no rows. */
  steps: OnboardingStepTemplate[] | null;
  /** The builder table does not exist yet (2026-08-18 migration not run). */
  migrationPending: boolean;
  /**
   * The table exists but the read came back empty. The caller cannot tell
   * "builder has no enabled steps" from "RLS hid every row" here; the
   * sandbox uses the viewer's roles to word its notice.
   */
  empty: boolean;
}

/** fetchOnboardingFlow plus the reason a null came back (sandbox notice). */
export async function fetchOnboardingFlowDetailed(): Promise<OnboardingFlowFetch> {
  const result = await probeTemplates(true);
  if (result.migrationPending) return { steps: null, migrationPending: true, empty: false };
  if (result.data.length === 0) return { steps: null, migrationPending: false, empty: true };
  const steps = result.data
    .sort(
      (a, b) =>
        (a.phase === "day_one" ? 1 : 0) - (b.phase === "day_one" ? 1 : 0) ||
        a.sort_order - b.sort_order,
    )
    .map(rowToTemplate);
  return { steps, migrationPending: false, empty: false };
}

/** The private bucket backing documents and proof uploads. */
export const ONBOARDING_ASSETS_BUCKET = "onboarding-assets";

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "file";

/** Upload a flow document (Dev Center) → storage path under docs/. */
export async function uploadFlowDocument(file: File): Promise<string> {
  const path = `docs/${Date.now().toString(36)}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage
    .from(ONBOARDING_ASSETS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/pdf" });
  if (error) throw error;
  return path;
}

/** Upload a starter's proof file → storage path under proof/{userId}/. */
export async function uploadProofFile(file: File, userId: string, taskId: string): Promise<string> {
  const path = `proof/${userId}/${taskId}-${Date.now().toString(36)}-${sanitizeFilename(file.name).slice(-60)}`;
  const { error } = await supabase.storage
    .from(ONBOARDING_ASSETS_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}

/**
 * 13 Oct (the owner): the profile-photo card. One image goes to two places:
 *   1. profile-pictures/avatars/{userId}-… (public) → profiles.avatar_url, so
 *      the starter's face shows everywhere Vexon OS draws an avatar at once;
 *   2. onboarding-assets/proof/{userId}/profile-photo-… (private) → the
 *      task's proof_path, the permanent HR record that the Employee Hub
 *      Documents tab lists and lets Elena download for Google Workspace.
 * Both writes use the starter's own session: the avatars/ INSERT policy and
 * "Starter uploads own proof" already allow them, as does "Users can update
 * their own profile".
 */
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_PREFIX = "profile-photo-";

export async function uploadProfilePhoto(
  file: File,
  userId: string,
): Promise<{ proofPath: string; publicUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Upload an image file (JPG or PNG).");
  if (file.size > PROFILE_PHOTO_MAX_BYTES) throw new Error("The photo must be smaller than 5 MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const stamp = Date.now().toString(36);

  const avatarPath = `avatars/${userId}-${stamp}.${ext}`;
  const { error: avatarError } = await supabase.storage
    .from("profile-pictures")
    .upload(avatarPath, file, { upsert: true, contentType: file.type });
  if (avatarError) throw avatarError;
  const { data: pub } = supabase.storage.from("profile-pictures").getPublicUrl(avatarPath);
  const publicUrl = pub.publicUrl;

  const proofPath = `proof/${userId}/${PROFILE_PHOTO_PREFIX}${stamp}.${ext}`;
  const { error: proofError } = await supabase.storage
    .from(ONBOARDING_ASSETS_BUCKET)
    .upload(proofPath, file, { contentType: file.type });
  if (proofError) throw proofError;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);
  if (profileError) throw profileError;

  return { proofPath, publicUrl };
}

/** Short-lived signed URL for any onboarding-assets path the caller may read. */
export async function signedAssetUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ONBOARDING_ASSETS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("Couldn't sign the file URL");
  return data.signedUrl;
}

export interface FlowStepInput {
  id?: string;
  step_key?: string;
  label: string;
  phase: string;
  step_type: string;
  link_url: string | null;
  video_url: string | null;
  /** Omit (undefined) on a pre-docs-migration database. */
  document_path?: string | null;
  /** Omit (undefined) before the 3 Sep deck migration. */
  description?: string | null;
  /** Omit (undefined) before the 4 Sep media migration. */
  thumbnail_path?: string | null;
  video_path?: string | null;
  /** Omit (undefined) before the 7 Sep refinement migration. */
  done_label?: string | null;
  quiz?: QuizDefinition | null;
  /** Omit (undefined) before the 8 Sep intro-video migration. */
  intro_video_path?: string | null;
  intro_video_url?: string | null;
  question_prompt: string | null;
  sort_order: number;
  enabled: boolean;
}

const slugify = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "step";

export function useSaveFlowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FlowStepInput) => {
      if (input.id) {
        const { id, step_key: _key, ...patch } = input;
        const { error } = await supabase
          .from("onboarding_step_templates" as never)
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        // step_key is derived once at creation and never edited — seeded
        // task rows reference it forever.
        const { error } = await supabase.from("onboarding_step_templates" as never).insert({
          ...input,
          step_key: `${slugify(input.label)}_${Date.now().toString(36)}`,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_FLOW_QUERY_KEY });
    },
  });
}

export function useDeleteFlowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_step_templates" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ONBOARDING_FLOW_QUERY_KEY });
    },
  });
}
