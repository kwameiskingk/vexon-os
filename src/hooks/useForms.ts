// Vexon OS Forms — data hooks for the builder, the responses view and the
// public renderer. Tables/functions: migration 20260918150000_forms.sql.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import type { FormRow, FormResponseRow, FormSchema } from "@/lib/forms/schema";
import { emptySchema } from "@/lib/forms/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export const FORMS_KEY = ["forms"] as const;

export function useForms() {
  return useQuery({
    queryKey: FORMS_KEY,
    queryFn: async (): Promise<FormRow[]> => {
      const { data, error } = await db.from("forms").select("*").order("updated_at", { ascending: false });
      if (error) { if (isMissingSchemaError(error)) return []; throw error; }
      return (data ?? []) as FormRow[];
    },
  });
}

export function useForm(id: string | undefined) {
  return useQuery({
    queryKey: [...FORMS_KEY, id],
    enabled: !!id,
    queryFn: async (): Promise<FormRow | null> => {
      const { data, error } = await db.from("forms").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as FormRow) ?? null;
    },
  });
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; kind: FormRow["kind"] }): Promise<FormRow> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await db.from("forms").insert({
        name: input.name, slug: input.slug, kind: input.kind,
        sink: input.kind === "lead" ? "marketing_leads" : input.kind === "hiring" ? "cv_screenings" : "none",
        notify_role: input.kind === "lead" ? "setter" : input.kind === "hiring" ? "ops" : null,
        schema: emptySchema(), created_by: auth.user?.id ?? null,
      }).select("*").single();
      if (error) throw error;
      return data as FormRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

export function useSaveForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<FormRow, "name" | "slug" | "kind" | "sink" | "notify_role" | "webhook_url" | "theme" | "status" | "notify_emails" | "close_push">> & { schema?: FormSchema } }) => {
      const { error } = await db.from("forms").update({ ...input.patch, updated_at: new Date().toISOString() }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: FORMS_KEY }); qc.invalidateQueries({ queryKey: [...FORMS_KEY, v.id] }); },
  });
}

/** Publish = copy the draft to the live schema and open the form. */
export function usePublishForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; schema: FormSchema }) => {
      const { error } = await db.from("forms").update({
        schema: input.schema, published_schema: input.schema, status: "live",
        published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: FORMS_KEY }); qc.invalidateQueries({ queryKey: [...FORMS_KEY, v.id] }); },
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("forms").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

/** Duplicate: same questions, "-copy" slug, draft. */
export function useDuplicateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: FormRow): Promise<FormRow> => {
      const { data: auth } = await supabase.auth.getUser();
      const base = `${src.slug}-copy`.slice(0, 55);
      let slug = base;
      for (let i = 2; i < 50; i++) {
        const { data: clash } = await db.from("forms").select("id").eq("slug", slug).maybeSingle();
        if (!clash) break; slug = `${base}-${i}`;
      }
      const { data, error } = await db.from("forms").insert({
        name: `${src.name} (copy)`, slug, kind: src.kind, sink: src.sink, notify_role: src.notify_role, webhook_url: src.webhook_url,
        theme: src.theme, notify_emails: src.notify_emails ?? [], close_push: src.close_push ?? false,
        schema: src.schema, created_by: auth.user?.id ?? null, status: "draft",
      }).select("*").single();
      if (error) throw error;
      return data as FormRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

/** Tags, reviewed mark, notes on a response (managers). */
export function useUpdateResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<FormResponseRow, "tags" | "reviewed_at" | "reviewed_by" | "notes">> }) => {
      const { error } = await db.from("form_responses").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-responses"] }),
  });
}

export interface FormVersionRow { id: string; form_id: string; version: number; schema: FormSchema; published_by: string | null; published_at: string }
export function useFormVersions(formId: string | undefined) {
  return useQuery({
    queryKey: ["form-versions", formId],
    enabled: !!formId,
    queryFn: async (): Promise<FormVersionRow[]> => {
      const { data, error } = await db.from("form_versions").select("*").eq("form_id", formId).order("version", { ascending: false });
      if (error) { if (isMissingSchemaError(error)) return []; throw error; }
      return (data ?? []) as FormVersionRow[];
    },
  });
}

/** One click → Close lead(s). Staff JWT; the function picks the org by form kind. */
export async function pushResponsesToClose(responseIds: string[]) {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_BASE}/form-push-close`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
    body: JSON.stringify({ response_ids: responseIds }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Push failed (${res.status})`);
  return body as { ok: boolean; results: Array<{ id: string; ok: boolean; lead_id?: string; error?: string; skipped?: string }> };
}

/** Builder media upload → public URL (bucket form-media). */
export async function uploadFormMedia(formId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${formId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("form-media").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return supabase.storage.from("form-media").getPublicUrl(path).data.publicUrl;
}

export function useFormResponses(formId: string | undefined) {
  return useQuery({
    queryKey: ["form-responses", formId],
    enabled: !!formId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FormResponseRow[]> => {
      const { data, error } = await db.from("form_responses").select("*").eq("form_id", formId).order("created_at", { ascending: false }).limit(1000);
      if (error) { if (isMissingSchemaError(error)) return []; throw error; }
      return (data ?? []) as FormResponseRow[];
    },
  });
}

export function useResponseCounts() {
  return useQuery({
    queryKey: ["form-response-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await db.from("form_responses").select("form_id").eq("is_partial", false).eq("is_test", false);
      if (error) { if (isMissingSchemaError(error)) return {}; throw error; }
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.form_id] = (out[r.form_id] ?? 0) + 1;
      return out;
    },
  });
}

export function useDeleteResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("form_responses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["form-responses"] }); qc.invalidateQueries({ queryKey: ["form-response-counts"] }); },
  });
}

/** Public: a live form's published schema by slug (draft for signed-in managers). */
export function usePublicForm(slug: string | undefined, draft = false) {
  return useQuery({
    queryKey: ["public-form", slug, draft],
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; slug: string; name: string; kind: string; theme: FormRow["theme"]; schema: FormSchema } | null> => {
      const { data, error } = await db.rpc("public_form", { _slug: slug, _draft: draft });
      if (error) throw error;
      return data && data.schema ? data : null;
    },
  });
}

export const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function submitForm(payload: Record<string, unknown>, opts?: { keepalive?: boolean }) {
  // keepalive lets a submit outlive the page: a redirect ending navigates the
  // whole window the moment the answer is given, and without this the browser
  // cancels the request on its way out and the response is never recorded.
  const res = await fetch(`${FUNCTIONS_BASE}/form-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" },
    body: JSON.stringify(payload),
    keepalive: opts?.keepalive ?? false,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Submit failed (${res.status})`), { errors: body.errors });
  return body as { ok: true; response_id: string; ending: import("@/lib/forms/schema").Ending | null; score_pct: number | null; prefill: Record<string, string> | null };
}

export async function uploadFormFile(formId: string, file: File): Promise<{ path: string; name: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${formId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("form-uploads").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}
