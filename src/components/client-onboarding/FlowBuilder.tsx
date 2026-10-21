// Authoring UI for the client onboarding flow — stages and steps, editable by
// dev/admin/ops/csm (RLS-gated). Shared verbatim between the Dev Center module
// and the CSM Onboarding tab. Edits shape FUTURE clients only: journeys are
// snapshots taken when onboarding starts, exactly like the TA flow builder.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { MediaFields } from "@/components/onboarding-deck/MediaFields";
import { useAuth } from "@/contexts/AuthContext";
import {
  CLIENT_FLOW_SETTINGS_KEY,
  saveClientFlowSettings,
  useClientFlowSettings,
} from "@/hooks/useClientFlowSettings";

const FLOW_QUERY_KEY = ["client-flow-templates"];

const STEP_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "confirm", label: "Tick to confirm", hint: "A simple checkbox step" },
  { value: "form", label: "Form", hint: "Questions answered in the dashboard" },
  { value: "booking", label: "Book a call", hint: "Vexon OS Bookings slot picker" },
  { value: "calendar_connect", label: "Connect calendar", hint: "Google calendar connection" },
  { value: "upload", label: "File upload", hint: "e.g. pitch deck" },
  { value: "text_list", label: "List entry", hint: "e.g. warm leads to target" },
  { value: "yes_no", label: "Yes / No", hint: "\"Do you have X?\" — the client uploads or lists; \"No\" only exists if you allow it below" },
  { value: "read_document", label: "Read a document", hint: "PDF you upload here" },
  { value: "link", label: "Open a link", hint: "External page to visit" },
];

interface FlowStage {
  id: string;
  stage_key: string;
  title: string;
  subtitle: string | null;
  sort_order: number;
  enabled: boolean;
  client_flow_steps: FlowStep[];
}

interface FlowStep {
  id: string;
  stage_id: string;
  step_key: string;
  label: string;
  description: string | null;
  step_type: string;
  config: Record<string, unknown>;
  video_url: string | null;
  document_path: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
  "step";

const sb = supabase as never as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

export function FlowBuilder() {
  const qc = useQueryClient();
  const { data: stages, isLoading, error } = useQuery<FlowStage[]>({
    queryKey: FLOW_QUERY_KEY,
    queryFn: async () => {
      const { data, error: qErr } = await sb
        .from("client_flow_stages")
        .select("*, client_flow_steps(*)")
        .order("sort_order");
      if (qErr) throw new Error(qErr.message);
      return (data as unknown as FlowStage[]).map((s) => ({
        ...s,
        client_flow_steps: (s.client_flow_steps || []).sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: FLOW_QUERY_KEY });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-violet-500" />;
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        The flow tables aren't available yet — run migration
        <code className="mx-1">20260826130000_client_onboarding_flow.sql</code> first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/40">
        Changes here shape <b>future</b> clients only — anyone already onboarding keeps the journey
        they started with. Stage order controls the locked sequence.
      </p>
      {(stages || []).map((stage) => (
        <StageEditor key={stage.id} stage={stage} onChanged={invalidate} />
      ))}
      <AddStage existing={stages || []} onChanged={invalidate} />
      <FinishScreenEditor />
    </div>
  );
}

/* ── Finish screen ───────────────────────────────────────────────────────── */

/**
 * The "You are all set" screen is not a card, so its video lives in
 * client_flow_settings (8 Sep 2026: Daniel's "onboarding complete"
 * recording). Same media controls as a card; it plays full-screen before
 * the finish screen exactly like a card intro.
 */
function FinishScreenEditor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useClientFlowSettings();
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (patch: { finish_video_path?: string; finish_video_url?: string; finish_thumbnail_path?: string }) =>
      saveClientFlowSettings(patch, user?.id),
    onSuccess: () => {
      toast.success("Finish screen saved");
      qc.invalidateQueries({ queryKey: CLIENT_FLOW_SETTINGS_KEY });
    },
    onError: (e: Error) =>
      toast.error(
        /client_flow_settings/.test(e.message)
          ? "Run migration 20260908150000_client_flow_settings.sql first"
          : e.message,
      ),
  });

  const hasVideo = !!(data?.finish_video_path || data?.finish_video_url);

  return (
    <div className="rounded-xl border bg-card">
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-medium flex-1">Finish screen · "You are all set"</span>
        <span className="text-[11px] text-muted-foreground">
          {isLoading ? "…" : hasVideo ? "Video attached — plays before the finish screen" : "No video yet"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Plays full-screen once every card is complete, before the "You are all set" screen. Upload the
            video here (or paste a Loom / YouTube link); saving is immediate.
          </p>
          <MediaFields
            value={{
              thumbnailPath: data?.finish_thumbnail_path ?? "",
              videoPath: data?.finish_video_path ?? "",
              videoUrl: data?.finish_video_url ?? "",
            }}
            onChange={(patch) =>
              save.mutate({
                ...(patch.thumbnailPath !== undefined ? { finish_thumbnail_path: patch.thumbnailPath } : {}),
                ...(patch.videoPath !== undefined ? { finish_video_path: patch.videoPath } : {}),
                ...(patch.videoUrl !== undefined ? { finish_video_url: patch.videoUrl } : {}),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ── Stage editor ────────────────────────────────────────────────────────── */

function StageEditor({ stage, onChanged }: { stage: FlowStage; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(stage.title);
  const [subtitle, setSubtitle] = useState(stage.subtitle ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = title !== stage.title || subtitle !== (stage.subtitle ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_flow_stages")
        .update({ title, subtitle: subtitle || null } as never)
        .eq("id", stage.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Stage saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await sb.from("client_flow_stages")
        .update({ enabled } as never).eq("id", stage.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_flow_stages").delete().eq("id", stage.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Stage deleted"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={`rounded-xl border bg-card ${stage.enabled ? "" : "opacity-60"}`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="h-7 w-7 rounded-full bg-violet-100 text-violet-700 text-sm font-semibold flex items-center justify-center shrink-0">
          {stage.sort_order}
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-medium text-sm">{stage.title}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {stage.client_flow_steps.length} step{stage.client_flow_steps.length === 1 ? "" : "s"}
            {!stage.enabled && " · disabled"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Subtitle</label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {dirty && (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save stage"}
              </Button>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={stage.enabled} onCheckedChange={(v) => toggle.mutate(v)} /> Enabled
            </label>
            <Button
              size="sm"
              variant={confirmDelete ? "destructive" : "ghost"}
              className="ml-auto text-xs"
              onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {confirmDelete ? "Really delete stage + steps?" : "Delete"}
            </Button>
          </div>

          <div className="space-y-3">
            {stage.client_flow_steps.map((step) => (
              <StepEditor key={step.id} step={step} onChanged={onChanged} />
            ))}
            <AddStep stage={stage} onChanged={onChanged} />
          </div>
        </div>
      )}
    </div>
  );
}

function AddStage({ existing, onChanged }: { existing: FlowStage[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const nextOrder = Math.max(0, ...existing.map((s) => s.sort_order)) + 1;
      const { error } = await sb.from("client_flow_stages").insert({
        stage_key: `${slugify(title)}_${Date.now().toString(36)}`,
        title,
        sort_order: nextOrder,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setTitle(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="New stage title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="max-w-sm"
      />
      <Button size="sm" variant="outline" disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>
        <Plus className="h-4 w-4 mr-1" /> Add stage
      </Button>
    </div>
  );
}

/* ── Step editor ─────────────────────────────────────────────────────────── */

interface FormQuestionDraft {
  key: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
  section?: string;
  options?: string[];
  prefill?: string;
}

interface StepDraft {
  label: string;
  description: string;
  step_type: string;
  video_url: string;
  link_url: string;
  document_path: string;
  placeholder: string;
  min_items: number;
  event_slug: string;
  accept: string;
  allow_decline: boolean;
  multiple: boolean;
  image_path: string;
  inline: boolean;
  question: string;
  on_yes: string;
  yes_label: string;
  no_label: string;
  no_guide_url: string;
  no_guide_label: string;
  /** 7 Sep: "No" keeps the card open and the upload required (pitch deck). */
  no_requires_upload: boolean;
  /** 11 Sep: off by default — every card must receive something (Marcus). */
  allow_no: boolean;
  template_url: string;
  template_label: string;
  /** 7 Sep: past-tense label for the finish card. */
  done_label: string;
  thumbnail_path: string;
  video_path: string;
  /** 8 Sep: explainer that plays full screen BEFORE the card (config keys). */
  intro_video_path: string;
  intro_video_url: string;
  /** 28 Sep: let the client start the step with the explainer in a mini-player. */
  follow_along: boolean;
  /** Chapter marks in the explainer (mm:ss while editing; seconds in config). */
  chapters: ChapterDraft[];
  questions: FormQuestionDraft[];
}

interface ChapterDraft {
  label: string;
  time: string;
}

/** 95 → "1:35"; the builder shows chapters as mm:ss. */
const secondsToClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** "1:35" → 95; "95" → 95; anything else → null. */
const clockToSeconds = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+):([0-5]?\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};


const QUESTION_TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Tick boxes" },
  { value: "fullname", label: "Full name" },
  { value: "address", label: "Address" },
];

const YES_NO_MODES: { value: string; label: string }[] = [
  { value: "upload", label: "Yes → upload a file" },
  { value: "list", label: "Yes → type a list" },
  { value: "upload_or_list", label: "Yes → upload or type" },
];

function StepEditor({ step, onChanged }: { step: FlowStep; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StepDraft>(() => ({
    label: step.label,
    description: step.description ?? "",
    step_type: step.step_type,
    video_url: step.video_url ?? "",
    link_url: step.link_url ?? "",
    document_path: step.document_path ?? "",
    placeholder: String(step.config?.placeholder ?? ""),
    min_items: Number(step.config?.min_items ?? 1),
    event_slug: String(step.config?.event_slug ?? ""),
    accept: String(step.config?.accept ?? ""),
    allow_decline: step.config?.allow_decline !== false,
    multiple: step.config?.multiple === true,
    // 4 Sep: thumbnail_path/video_path are uploads in the onboarding-media
    // bucket; image_path is the pre-4-Sep field, still read so old flows keep
    // their picture until someone re-uploads one.
    image_path: String(step.config?.image_path ?? ""),
    thumbnail_path: String(step.config?.thumbnail_path ?? ""),
    video_path: String(step.config?.video_path ?? ""),
    intro_video_path: String(step.config?.intro_video_path ?? ""),
    intro_video_url: String(step.config?.intro_video_url ?? ""),
    follow_along: step.config?.follow_along === true,
    chapters: ((step.config?.chapters as Array<{ label?: string; seconds?: number }> | undefined) ?? [])
      .filter((c) => typeof c?.seconds === "number")
      .map((c) => ({ label: c.label ?? "", time: secondsToClock(c.seconds as number) })),
    inline: step.config?.inline === true,
    question: String(step.config?.question ?? ""),
    on_yes: String(step.config?.on_yes ?? "upload"),
    yes_label: String(step.config?.yes_label ?? ""),
    no_label: String(step.config?.no_label ?? ""),
    no_guide_url: String(step.config?.no_guide_url ?? ""),
    no_guide_label: String(step.config?.no_guide_label ?? ""),
    no_requires_upload: step.config?.no_requires_upload === true,
    allow_no: step.config?.allow_no === true,
    template_url: String(step.config?.template_url ?? ""),
    template_label: String(step.config?.template_label ?? ""),
    done_label: String(step.config?.done_label ?? ""),
    questions: ((step.config?.questions as FormQuestionDraft[] | undefined) ?? []).map((q) => ({
      key: q.key, label: q.label, type: q.type ?? "text", required: q.required !== false,
      help: q.help ?? "", section: q.section ?? "", options: q.options ?? [], prefill: q.prefill ?? "",
    })),
  }));

  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const buildConfig = (): Record<string, unknown> => {
    // Media (3 Sep): an image on the left of the card, any step type.
    const media = {
      ...(draft.image_path ? { image_path: draft.image_path } : {}),
      ...(draft.thumbnail_path ? { thumbnail_path: draft.thumbnail_path } : {}),
      ...(draft.video_path ? { video_path: draft.video_path } : {}),
      ...(draft.intro_video_path ? { intro_video_path: draft.intro_video_path } : {}),
      ...(draft.intro_video_url.trim() ? { intro_video_url: draft.intro_video_url.trim() } : {}),
      ...(draft.done_label.trim() ? { done_label: draft.done_label.trim() } : {}),
      // 28 Sep follow-along: only written when on, so untouched steps keep a
      // clean config. Chapters are stored in seconds, sorted, blanks dropped.
      ...(draft.follow_along ? { follow_along: true } : {}),
      ...(draft.follow_along && draft.chapters.length > 0
        ? {
            chapters: draft.chapters
              .map((c) => ({ label: c.label.trim(), seconds: clockToSeconds(c.time) }))
              .filter((c): c is { label: string; seconds: number } => c.seconds !== null)
              .sort((a, b) => a.seconds - b.seconds),
          }
        : {}),
    };
    switch (draft.step_type) {
      case "form": {
        const questions = draft.questions.map((q) => ({
          key: q.key,
          label: q.label,
          type: q.type,
          required: q.required,
          ...(q.help ? { help: q.help } : {}),
          ...(q.section ? { section: q.section } : {}),
          ...(q.type === "checkbox" ? { options: (q.options ?? []).filter(Boolean) } : {}),
          ...(q.prefill ? { prefill: q.prefill } : {}),
        }));
        const sections: string[] = [];
        for (const q of questions) if (q.section && !sections.includes(q.section)) sections.push(q.section);
        return { ...media, questions, sections, ...(draft.inline ? { inline: true } : {}), ...(typeof step.config?.enquire_slug === "string" ? { enquire_slug: step.config.enquire_slug } : {}) };
      }
      case "yes_no":
        return {
          ...media,
          question: draft.question,
          on_yes: draft.on_yes,
          multiple: draft.multiple,
          ...(draft.accept ? { accept: draft.accept } : {}),
          ...(draft.placeholder ? { placeholder: draft.placeholder } : {}),
          min_items: draft.min_items || 1,
          ...(draft.yes_label ? { yes_label: draft.yes_label } : {}),
          ...(draft.no_label ? { no_label: draft.no_label } : {}),
          ...(draft.no_guide_url ? { no_guide_url: draft.no_guide_url } : {}),
          ...(draft.no_guide_label ? { no_guide_label: draft.no_guide_label } : {}),
          ...(draft.template_url ? { template_url: draft.template_url } : {}),
          ...(draft.template_label ? { template_label: draft.template_label } : {}),
          ...(draft.no_requires_upload ? { no_requires_upload: true } : {}),
          ...(draft.allow_no ? { allow_no: true } : {}),
        };
      case "text_list":
        return {
          ...media,
          placeholder: draft.placeholder || undefined,
          min_items: draft.min_items || 1,
          allow_decline: draft.allow_decline,
        };
      case "booking":
        return { ...media, event_slug: draft.event_slug };
      case "upload":
        return {
          ...media,
          ...(draft.accept ? { accept: draft.accept } : {}),
          multiple: draft.multiple,
          allow_decline: draft.allow_decline,
        };
      default:
        return { ...media };
    }
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const path = `flow-docs/img-${Date.now().toString(36)}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      const { error } = await supabase.storage.from("client-onboarding-assets").upload(path, file);
      if (error) throw new Error(error.message);
      setDraft((d) => ({ ...d, image_path: path }));
      toast.success("Image uploaded — save the step to keep it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_flow_steps").update({
        label: draft.label,
        description: draft.description || null,
        step_type: draft.step_type,
        config: buildConfig(),
        video_url: draft.video_url || null,
        link_url: draft.link_url || null,
        document_path: draft.document_path || null,
      } as never).eq("id", step.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Step saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_flow_steps").delete().eq("id", step.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadDoc = async (file: File | undefined) => {
    if (!file) return;
    setUploadingDoc(true);
    try {
      const path = `flow-docs/${Date.now().toString(36)}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      const { error } = await supabase.storage.from("client-onboarding-assets").upload(path, file);
      if (error) throw new Error(error.message);
      setDraft((d) => ({ ...d, document_path: path }));
      toast.success("Document uploaded — save the step to keep it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  const typeInfo = STEP_TYPES.find((t) => t.value === draft.step_type);

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm flex-1 min-w-0 truncate">{step.label}</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">
          {STEP_TYPES.find((t) => t.value === step.step_type)?.label ?? step.step_type}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={draft.step_type} onValueChange={(v) => setDraft((d) => ({ ...d, step_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {typeInfo && <p className="text-[11px] text-muted-foreground">{typeInfo.hint}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Card intro (the card speaks for itself; no name is shown)</label>
            <Textarea rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Please complete the onboarding form…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Done label (past tense, shown on the finish card once complete)</label>
            <Input value={draft.done_label} onChange={(e) => setDraft((d) => ({ ...d, done_label: e.target.value }))} placeholder="Pitch deck uploaded" />
          </div>

          {draft.step_type === "form" && typeof step.config?.enquire_slug === "string" && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
              The questions for this card live in <b>Enquire</b> (form <code>{String(step.config.enquire_slug)}</code>). Edit them in Form Builder → Client onboarding and press Publish there; the card always shows the live version. The list below is only the snapshot this builder last saved.
            </div>
          )}
          {draft.step_type === "form" && (
            <>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch checked={draft.inline} onCheckedChange={(v) => setDraft((d) => ({ ...d, inline: v }))} />
                <span>Show questions on the card itself (short forms). Off = full-screen pop-out with sections.</span>
              </label>
              <FormQuestionsEditor
                questions={draft.questions}
                onChange={(questions) => setDraft((d) => ({ ...d, questions }))}
              />
            </>
          )}
          {draft.step_type === "yes_no" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">The question</label>
                <Input value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} placeholder="Do you have a pitch deck?" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">When they say yes</label>
                  <Select value={draft.on_yes} onValueChange={(v) => setDraft((d) => ({ ...d, on_yes: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YES_NO_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Accepted file types</label>
                  <Input value={draft.accept} onChange={(e) => setDraft((d) => ({ ...d, accept: e.target.value }))} placeholder=".pdf,.pptx,.xlsx" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">List placeholder</label>
                  <Input value={draft.placeholder} onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))} placeholder="Company name, contact, why" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Minimum list entries</label>
                  <Input type="number" min={1} value={draft.min_items} onChange={(e) => setDraft((d) => ({ ...d, min_items: Number(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Yes button label</label>
                  <Input value={draft.yes_label} onChange={(e) => setDraft((d) => ({ ...d, yes_label: e.target.value }))} placeholder="Yes, I have this" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">No button label</label>
                  <Input value={draft.no_label} onChange={(e) => setDraft((d) => ({ ...d, no_label: e.target.value }))} placeholder="No, not right now" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Guide link shown with "No" (optional)</label>
                  <Input value={draft.no_guide_url} onChange={(e) => setDraft((d) => ({ ...d, no_guide_url: e.target.value }))} placeholder="https://…" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Guide link label</label>
                  <Input value={draft.no_guide_label} onChange={(e) => setDraft((d) => ({ ...d, no_guide_label: e.target.value }))} placeholder="How to create a simple pitch deck" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Template link shown with "No" (optional)</label>
                  <Input value={draft.template_url} onChange={(e) => setDraft((d) => ({ ...d, template_url: e.target.value }))} placeholder="https://…" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Template link label</label>
                  <Input value={draft.template_label} onChange={(e) => setDraft((d) => ({ ...d, template_label: e.target.value }))} placeholder="Download the pitch deck template" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch checked={draft.allow_no} onCheckedChange={(v) => setDraft((d) => ({ ...d, allow_no: v }))} />
                <span>
                  Allow &ldquo;No&rdquo; as an answer
                  <span className="block text-[11px] opacity-80">
                    Off (the default since 11 Sep): the client must upload or list something and no Yes / No choice is shown. On: &ldquo;No&rdquo; completes the card with nothing provided.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch checked={draft.no_requires_upload} onCheckedChange={(v) => setDraft((d) => ({ ...d, no_requires_upload: v }))} />
                <span>
                  &ldquo;Not yet&rdquo; shows the guide but does not complete the card
                  <span className="block text-[11px] opacity-80">
                    The pitch deck pattern: the choice is shown, &ldquo;No&rdquo; reveals the guide and template, and the upload stays required.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch checked={draft.multiple} onCheckedChange={(v) => setDraft((d) => ({ ...d, multiple: v }))} />
                <span>Allow more than one file</span>
              </label>
            </div>
          )}
          {draft.step_type === "text_list" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Placeholder</label>
                <Input value={draft.placeholder} onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Minimum entries</label>
                <Input
                  type="number" min={1}
                  value={draft.min_items}
                  onChange={(e) => setDraft((d) => ({ ...d, min_items: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
          )}
          {draft.step_type === "booking" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Booking event slug</label>
              <Input value={draft.event_slug} onChange={(e) => setDraft((d) => ({ ...d, event_slug: e.target.value }))} placeholder="onboarding-call-msp-a7w3k" />
              <p className="text-[11px] text-muted-foreground">The event (and its host) lives in Dev Center → Bookings.</p>
            </div>
          )}
          {draft.step_type === "upload" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Accepted file types</label>
                <Input value={draft.accept} onChange={(e) => setDraft((d) => ({ ...d, accept: e.target.value }))} placeholder=".pdf,.pptx" />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch checked={draft.multiple} onCheckedChange={(v) => setDraft((d) => ({ ...d, multiple: v }))} />
                <span>Allow more than one file</span>
              </label>
            </div>
          )}
          {(draft.step_type === "text_list" || draft.step_type === "upload") && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Switch
                checked={draft.allow_decline}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, allow_decline: v }))}
              />
              <span>
                Let the client answer &ldquo;I haven&rsquo;t got one&rdquo;
                <span className="block text-[11px] opacity-80">
                  They must still respond — the decline and their reason are recorded for the CSM.
                  Turn this off to make the step strictly mandatory.
                </span>
              </span>
            </label>
          )}
          {draft.step_type === "read_document" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Document (PDF)</label>
              <div className="flex items-center gap-2">
                <label className="inline-flex">
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => uploadDoc(e.target.files?.[0])} />
                  <span className="inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted">
                    {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload PDF
                  </span>
                </label>
                {draft.document_path && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {draft.document_path.split("/").pop()}
                  </span>
                )}
              </div>
            </div>
          )}
          {draft.step_type === "link" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Link URL</label>
              <Input value={draft.link_url} onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))} placeholder="https://…" />
            </div>
          )}

          <MediaFields
            mode="intro"
            value={{ thumbnailPath: "", videoPath: draft.intro_video_path, videoUrl: draft.intro_video_url }}
            onChange={(patch) =>
              setDraft((d) => ({
                ...d,
                ...(patch.videoPath !== undefined ? { intro_video_path: patch.videoPath } : {}),
                ...(patch.videoUrl !== undefined ? { intro_video_url: patch.videoUrl } : {}),
              }))
            }
          />

          <FollowAlongFields
            enabled={draft.follow_along}
            chapters={draft.chapters}
            hasUpload={!!draft.intro_video_path}
            isForm={draft.step_type === "form" && !draft.inline}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />

          <MediaFields
            value={{
              thumbnailPath: draft.thumbnail_path,
              videoPath: draft.video_path,
              videoUrl: draft.video_url,
            }}
            onChange={(patch) =>
              setDraft((d) => ({
                ...d,
                ...(patch.thumbnailPath !== undefined ? { thumbnail_path: patch.thumbnailPath, image_path: "" } : {}),
                ...(patch.videoPath !== undefined ? { video_path: patch.videoPath } : {}),
                ...(patch.videoUrl !== undefined ? { video_url: patch.videoUrl } : {}),
              }))
            }
          />

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !draft.label.trim()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save step"}
            </Button>
            <Button
              size="sm"
              variant={confirmDelete ? "destructive" : "ghost"}
              className="ml-auto text-xs"
              onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {confirmDelete ? "Really delete?" : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 28 Sep (Marcus via Daniel): the follow-along switch and its chapters.
 * On: the explainer card gains "Start the step while the video plays" and
 * the video carries on in a mini-player in the corner. Chapters (mm:ss)
 * are what a sectioned form follows as the client moves between sections:
 * first chapter = first section, and so on.
 */
function FollowAlongFields({
  enabled, chapters, hasUpload, isForm, onChange,
}: {
  enabled: boolean;
  chapters: ChapterDraft[];
  hasUpload: boolean;
  isForm: boolean;
  onChange: (patch: { follow_along?: boolean; chapters?: ChapterDraft[] }) => void;
}) {
  const update = (i: number, patch: Partial<ChapterDraft>) =>
    onChange({ chapters: chapters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3">
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Switch checked={enabled} onCheckedChange={(v) => onChange({ follow_along: v })} />
        <span>
          <span className="font-semibold text-foreground">Let them start the step while the video plays</span>
          <span className="block text-[11px] opacity-80">
            Adds a &ldquo;Start the step while the video plays&rdquo; button to the explainer. The video carries on in a small
            player in the corner of the page, from where it had got to, until they close it or it ends.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-2 pl-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Chapters (optional)</label>
            <p className="text-[11px] text-muted-foreground">
              Where each part of the video starts, as mm:ss.
              {isForm
                ? " On a sectioned form the video jumps to the matching chapter when they change section: first chapter for the first section, and so on."
                : " Shown as buttons under the mini-player."}
              {!hasUpload && " Chapters only work with an uploaded video, not a Loom / YouTube link."}
            </p>
          </div>
          {chapters.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground w-6 shrink-0">{i + 1}.</span>
              <Input
                className="h-8 text-xs w-24 shrink-0 font-mono"
                value={c.time}
                placeholder="1:19"
                onChange={(e) => update(i, { time: e.target.value })}
              />
              <Input
                className="h-8 text-xs"
                value={c.label}
                placeholder="Ideal Customer Profile"
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => onChange({ chapters: chapters.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            size="sm" variant="outline" className="h-8"
            onClick={() => onChange({ chapters: [...chapters, { label: "", time: chapters.length === 0 ? "0:00" : "" }] })}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add chapter
          </Button>
        </div>
      )}
    </div>
  );
}

function FormQuestionsEditor({
  questions,
  onChange,
}: {
  questions: FormQuestionDraft[];
  onChange: (q: FormQuestionDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<FormQuestionDraft>) =>
    onChange(questions.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Form questions ({questions.length})</label>
      {questions.map((q, i) => (
        <div key={q.key} className="rounded-md border bg-background p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground w-6 shrink-0">{i + 1}.</span>
            <Input value={q.label} placeholder="Question" onChange={(e) => update(i, { label: e.target.value })} />
            <Select value={q.type} onValueChange={(v) => update(i, { type: v })}>
              <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Switch checked={q.required} onCheckedChange={(v) => update(i, { required: v })} />
              req
            </label>
            <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => onChange(questions.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 pl-8">
            <Input className="h-8 text-xs" value={q.section ?? ""} placeholder="Section (e.g. Business details)" onChange={(e) => update(i, { section: e.target.value })} />
            <Input className="h-8 text-xs" value={q.help ?? ""} placeholder="Help text shown under the question" onChange={(e) => update(i, { help: e.target.value })} />
            {q.type === "checkbox" && (
              <Input className="h-8 text-xs sm:col-span-2" value={(q.options ?? []).join(" | ")} placeholder="Options separated by | (e.g. Permanent | Contract | Temporary)" onChange={(e) => update(i, { options: e.target.value.split("|").map((x) => x.trim()) })} />
            )}
            <Select value={q.prefill || "none"} onValueChange={(v) => update(i, { prefill: v === "none" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No pre-fill</SelectItem>
                <SelectItem value="company_name">Pre-fill: company name</SelectItem>
                <SelectItem value="contact_name">Pre-fill: contact name</SelectItem>
                <SelectItem value="email">Pre-fill: login email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
      <Button
        size="sm" variant="outline"
        onClick={() =>
          onChange([...questions, { key: `q_${Date.now().toString(36)}`, label: "", type: "text", required: true, section: questions[questions.length - 1]?.section ?? "" }])
        }
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add question
      </Button>
    </div>
  );
}

function AddStep({ stage, onChanged }: { stage: FlowStage; onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const nextOrder = Math.max(0, ...stage.client_flow_steps.map((s) => s.sort_order)) + 1;
      const { error } = await sb.from("client_flow_steps").insert({
        stage_id: stage.id,
        step_key: `${slugify(label)}_${Date.now().toString(36)}`,
        label,
        step_type: "confirm",
        sort_order: nextOrder,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setLabel(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="New step label…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="max-w-sm h-8 text-sm"
      />
      <Button size="sm" variant="outline" className="h-8" disabled={!label.trim() || add.isPending} onClick={() => add.mutate()}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add step
      </Button>
    </div>
  );
}
