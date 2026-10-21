// Enquire (Vexon OS Forms) - the builder. Questions on the left, the selected question's
// settings + logic on the right, endings and form settings below. Save keeps
// the draft; Publish copies it live. Schema: src/lib/forms/schema.ts.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { EnquireHead } from "@/components/forms/EnquireHead";
import { useEnquireNav } from "@/lib/forms/enquireNav";
import { Button } from "@/components/ui/button";
import { ButtonV2, Pill } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useForm, useFormVersions, usePublishForm, useSaveForm, uploadFormMedia } from "@/hooks/useForms";
import { format } from "date-fns";
import {
  QUESTION_TYPE_LABEL, emptySchema, hasChoices, slugify, uid,
  type Ending, type FormKind, type FormRow, type FormSchema, type FormSink, type LogicRule, type Media, type Question, type QuestionType,
} from "@/lib/forms/schema";
import { formPublicUrl } from "./FormsPage";
import { mediaKindLabel } from "@/lib/forms/media";
import { computeScore } from "@/lib/forms/schema";

const KINDS: QuestionType[] = ["short_text", "long_text", "email", "phone", "website", "number", "yes_no", "choice", "multi_choice", "dropdown", "rating", "opinion_scale", "ranking", "legal", "date", "full_name", "address", "file", "statement"];

export default function FormEditorPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <FormEditorBody id={id} />
      </PageContainer>
    </DashboardLayout>
  );
}

/** The builder itself: on the page above and inside the Dev Centre. */
export function FormEditorBody({ id }: { id?: string }) {
  const go = useEnquireNav();
  const { data: form, isLoading } = useForm(id);
  const save = useSaveForm();
  const publish = usePublishForm();

  const [schema, setSchema] = useState<FormSchema>(emptySchema());
  const [meta, setMeta] = useState({ name: "", slug: "", kind: "general" as FormKind, sink: "none" as FormSink, notify_role: "", webhook_url: "", accent: "", appearance: "light" as NonNullable<NonNullable<FormRow["theme"]>["appearance"]>, notify_emails: "", close_push: false, branding: true });
  const versions = useFormVersions(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!form) return;
    const s = form.schema && Array.isArray(form.schema.questions) ? form.schema : emptySchema();
    setSchema({ ...emptySchema(), ...s });
    setMeta({ name: form.name, slug: form.slug, kind: form.kind, sink: form.sink, notify_role: form.notify_role ?? "", webhook_url: form.webhook_url ?? "", accent: form.theme?.accent ?? "", appearance: form.theme?.appearance ?? "light", notify_emails: (form.notify_emails ?? []).join(", "), close_push: form.close_push === true, branding: form.theme?.branding !== false });
    setSelected((cur) => cur ?? s.questions?.[0]?.id ?? null);
    setDirty(false);
  }, [form]);

  const q = schema.questions.find((x) => x.id === selected) ?? null;
  const patchSchema = (fn: (s: FormSchema) => FormSchema) => { setSchema((s) => fn(s)); setDirty(true); };
  const patchQ = (qid: string, patch: Partial<Question>) => patchSchema((s) => ({ ...s, questions: s.questions.map((x) => (x.id === qid ? { ...x, ...patch } : x)) }));

  const addQuestion = (type: QuestionType = "short_text") => {
    const n = schema.questions.length + 1;
    const nq: Question = { id: uid(), ref: `q${n}`, type, title: "", required: type !== "statement", choices: hasChoices(type) || type === "ranking" ? (type === "yes_no" ? [{ id: uid(), label: "Yes" }, { id: uid(), label: "No" }] : [{ id: uid(), label: "Option A" }, { id: uid(), label: "Option B" }]) : undefined, ...(type === "rating" ? { scale: 5 } : type === "opinion_scale" ? { scale: 10 } : {}) };
    patchSchema((s) => ({ ...s, questions: [...s.questions, nq] }));
    setSelected(nq.id);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over?.id;
    if (!over || over === e.active.id) return;
    patchSchema((s) => {
      const from = s.questions.findIndex((x) => x.id === e.active.id);
      const to = s.questions.findIndex((x) => x.id === over);
      if (from < 0 || to < 0) return s;
      return { ...s, questions: arrayMove(s.questions, from, to) };
    });
  };
  const move = (qid: string, dir: -1 | 1) => patchSchema((s) => {
    const i = s.questions.findIndex((x) => x.id === qid); const j = i + dir;
    if (i < 0 || j < 0 || j >= s.questions.length) return s;
    const qs = [...s.questions]; [qs[i], qs[j]] = [qs[j], qs[i]]; return { ...s, questions: qs };
  });
  const remove = (qid: string) => { patchSchema((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== qid), logic: s.logic.filter((r) => r.question_id !== qid && r.target !== qid) })); setSelected(null); };

  // Best possible score = every scored question answered with its top choice.
  const maxPoints = useMemo(() => {
    const best: Record<string, unknown> = {};
    for (const x of schema.questions) if (hasChoices(x.type) && x.choices?.length) best[x.id] = x.choices.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a)).label;
    return computeScore(schema, best, schema.questions).max;
  }, [schema]);

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!meta.name.trim()) out.push("Give the form a name.");
    if (schema.questions.length === 0) out.push("Add at least one question.");
    schema.questions.forEach((x, i) => { if (!x.title.trim()) out.push(`Question ${i + 1} has no title.`); if (hasChoices(x.type) && !(x.choices?.length)) out.push(`Question ${i + 1} needs choices.`); });
    if (!schema.endings.length) out.push("Add an ending.");
    const refs = schema.questions.map((x) => x.ref); if (new Set(refs).size !== refs.length) out.push("Two questions share the same key.");
    return out;
  }, [schema, meta.name]);

  const persist = async (thenPublish = false) => {
    if (!id) return;
    const patch = { name: meta.name.trim(), slug: slugify(meta.slug || meta.name), kind: meta.kind, sink: meta.sink, notify_role: meta.notify_role || null, webhook_url: meta.webhook_url.trim() || null, theme: { ...(meta.accent ? { accent: meta.accent } : {}), appearance: meta.appearance, ...(meta.branding ? {} : { branding: false }) }, notify_emails: meta.notify_emails.split(",").map((x) => x.trim()).filter(Boolean), close_push: meta.close_push };
    try {
      if (thenPublish) { await save.mutateAsync({ id, patch }); await publish.mutateAsync({ id, schema }); toast.success("Published. The link is live."); }
      else { await save.mutateAsync({ id, patch: { ...patch, schema } }); toast.success("Draft saved"); }
      setDirty(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  };

  if (isLoading || !form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
        <EnquireHead
          eyebrow="Enquire · builder"
          title={meta.name || "Untitled form"}
          subtitle={`/f/${meta.slug}`}
          actions={<div className="flex flex-wrap items-center gap-[6px]">
            <Pill variant={form.status === "live" ? "ok" : "warn"}>{form.status}</Pill>
            {dirty && <Pill variant="warn">unsaved changes</Pill>}
            <ButtonV2 size="sm" variant="ghost" onClick={() => go({ view: "list" })}>← Enquire</ButtonV2>
            <ButtonV2 size="sm" onClick={() => window.open(`/f/${form.slug}?draft=1`, "_blank", "noopener")}>Preview</ButtonV2>
            <ButtonV2 size="sm" onClick={() => { navigator.clipboard.writeText(formPublicUrl(form.slug)); toast.success("Link copied"); }}>Copy link</ButtonV2>
            <ButtonV2 size="sm" onClick={() => id && go({ view: "responses", id })}>Responses</ButtonV2>
            <ButtonV2 size="sm" onClick={() => persist(false)} disabled={save.isPending}>Save draft</ButtonV2>
            <ButtonV2 size="sm" variant="primary" onClick={() => persist(true)} disabled={publish.isPending || problems.length > 0} title={problems.join("\n")}>Publish</ButtonV2>
          </div>}
        />
        <div className="space-y-4">
        {problems.length > 0 && <ul className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Questions list */}
          <aside className="space-y-2">
            <div className="rounded-xl border border-border bg-card">
              <button type="button" onClick={() => setSelected("__welcome")} className={cn("flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm", selected === "__welcome" && "bg-muted/60")}>
                <span className="text-xs text-muted-foreground">Welcome</span><span className="truncate">{schema.welcome?.title || <i className="text-muted-foreground">none</i>}</span>
              </button>
              {/* 2 Oct (the owner): the grip drags a question to a new position. Clicking the row still opens it. */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={schema.questions.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                  <ul>
                    {schema.questions.map((x, i) => (
                      <SortableQuestionRow
                        key={x.id}
                        id={x.id}
                        index={i}
                        title={x.title}
                        hasLogic={schema.logic.some((r) => r.question_id === x.id)}
                        selected={selected === x.id}
                        onSelect={() => setSelected(x.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              <div className="border-t border-border p-2">
                {/* value="" keeps the picker "empty" so choosing the same type twice still fires (the owner, 19 Sep). */}
                <Select value="" onValueChange={(v) => addQuestion(v as QuestionType)}>
                  <SelectTrigger className="h-8 text-xs"><span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add question</span></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{QUESTION_TYPE_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card">
              <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Endings</p>
              <ul>
                {schema.endings.map((e) => (
                  <li key={e.id}><button type="button" onClick={() => setSelected(`end:${e.id}`)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40", selected === `end:${e.id}` && "bg-muted/60")}>
                    <span className="min-w-0 flex-1 truncate">{e.title || "Untitled ending"}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{e.kind}</span>
                    {schema.default_ending === e.id && <span className="text-[10px] text-primary">default</span>}
                  </button></li>
                ))}
              </ul>
              <div className="border-t border-border p-2">
                <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-1 text-xs" onClick={() => { const e: Ending = { id: uid(), kind: "message", title: "Thanks!", outcome: "submitted" }; patchSchema((s) => ({ ...s, endings: [...s.endings, e] })); setSelected(`end:${e.id}`); }}><Plus className="h-3.5 w-3.5" /> Add ending</Button>
              </div>
            </div>
            <button type="button" onClick={() => setSelected("__settings")} className={cn("w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/40", selected === "__settings" && "bg-muted/60")}>Form settings · scoring · where answers go</button>
          </aside>

          {/* Editor panel */}
          <section className="rounded-xl border border-border bg-card p-4">
            {selected === "__welcome" && (
              <div className="space-y-3">
                <h2 className="font-medium">Welcome screen</h2>
                <p className="text-xs text-muted-foreground">Optional. Leave the title blank to start on question 1.</p>
                <Field label="Title"><Input value={schema.welcome?.title ?? ""} onChange={(e) => patchSchema((s) => ({ ...s, welcome: { ...(s.welcome ?? { title: "" }), title: e.target.value } }))} /></Field>
                <Field label="Text"><Textarea value={schema.welcome?.body ?? ""} onChange={(e) => patchSchema((s) => ({ ...s, welcome: { ...(s.welcome ?? { title: "" }), body: e.target.value } }))} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Button"><Input value={schema.welcome?.button ?? ""} placeholder="Start" onChange={(e) => patchSchema((s) => ({ ...s, welcome: { ...(s.welcome ?? { title: "" }), button: e.target.value } }))} /></Field>
                  <Field label="Time hint" hint="Shown next to the button, e.g. takes about 4 minutes"><Input value={schema.welcome?.time_hint ?? ""} onChange={(e) => patchSchema((s) => ({ ...s, welcome: { ...(s.welcome ?? { title: "" }), time_hint: e.target.value } }))} /></Field>
                </div>
                <MediaFields formId={id} media={schema.welcome?.media} onChange={(m) => patchSchema((s) => ({ ...s, welcome: { ...(s.welcome ?? { title: "" }), media: m } }))} />
              </div>
            )}

            {q && (
              <Tabs defaultValue="question">
                <div className="flex items-center gap-2">
                  <TabsList><TabsTrigger value="question">Question</TabsTrigger><TabsTrigger value="logic">Logic {schema.logic.filter((r) => r.question_id === q.id).length > 0 && `(${schema.logic.filter((r) => r.question_id === q.id).length})`}</TabsTrigger></TabsList>
                  <div className="ml-auto flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(q.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(q.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <TabsContent value="question" className="space-y-3 pt-3">
                  <Field label="Question"><Textarea rows={2} value={q.title} onChange={(e) => patchQ(q.id, { title: e.target.value })} placeholder="What is your full name?" /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Type"><Select value={q.type} onValueChange={(v) => { const t = v as QuestionType; patchQ(q.id, { type: t, choices: hasChoices(t) ? (q.choices?.length ? q.choices : t === "yes_no" ? [{ id: uid(), label: "Yes" }, { id: uid(), label: "No" }] : [{ id: uid(), label: "Option A" }]) : undefined }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{QUESTION_TYPE_LABEL[k]}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="Key (for prefill and @recall)" hint="name, email, phone, company, first_name, last_name, revenue…"><Input value={q.ref} onChange={(e) => patchQ(q.id, { ref: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} /></Field>
                  </div>
                  <Field label="Help text"><Input value={q.help ?? ""} onChange={(e) => patchQ(q.id, { help: e.target.value })} /></Field>
                  <Field label="Section" hint="Optional grouping, e.g. Business Details. Used where a form shows a section at a time (the client onboarding card); the public link still asks one question per screen."><Input value={q.section ?? ""} onChange={(e) => patchQ(q.id, { section: e.target.value })} /></Field>
                  {!hasChoices(q.type) && q.type !== "file" && q.type !== "statement" && <Field label="Placeholder"><Input value={q.placeholder ?? ""} onChange={(e) => patchQ(q.id, { placeholder: e.target.value })} /></Field>}
                  {q.type === "file" && <Field label="Accepted files"><Input value={q.accept ?? ".pdf,.doc,.docx"} onChange={(e) => patchQ(q.id, { accept: e.target.value })} /></Field>}
                  {(q.type === "rating" || q.type === "opinion_scale") && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label={q.type === "rating" ? "Stars (3–10)" : "Top of scale (0 to…)"}><Input type="number" min={q.type === "rating" ? 3 : 2} max={10} value={q.scale ?? (q.type === "rating" ? 5 : 10)} onChange={(e) => patchQ(q.id, { scale: Number(e.target.value) || undefined })} /></Field>
                      <Field label="Low label"><Input value={q.scale_labels?.low ?? ""} placeholder={q.type === "rating" ? "" : "Not at all"} onChange={(e) => patchQ(q.id, { scale_labels: { ...(q.scale_labels ?? {}), low: e.target.value } })} /></Field>
                      <Field label="High label"><Input value={q.scale_labels?.high ?? ""} placeholder={q.type === "rating" ? "" : "Absolutely"} onChange={(e) => patchQ(q.id, { scale_labels: { ...(q.scale_labels ?? {}), high: e.target.value } })} /></Field>
                    </div>
                  )}
                  {q.type === "legal" && <Field label="Tick-box wording" hint="What they agree to, e.g. I accept the privacy policy"><Input value={q.placeholder ?? ""} onChange={(e) => patchQ(q.id, { placeholder: e.target.value })} placeholder="I accept" /></Field>}
                  {q.type !== "statement" && <label className="flex items-center gap-2 text-sm"><Switch checked={q.required} onCheckedChange={(v) => patchQ(q.id, { required: v })} /> Required</label>}
                  <MediaFields formId={id} media={q.media} withPosition onChange={(m) => patchQ(q.id, { media: m })} />
                  {(hasChoices(q.type) || q.type === "ranking") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><Label>Choices</Label>{schema.scoring.enabled && <span className="text-xs text-muted-foreground">points (minus numbers knock down)</span>}</div>
                      {(q.choices ?? []).map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className="w-5 text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                          <Input value={c.label} onChange={(e) => patchQ(q.id, { choices: q.choices!.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })} />
                          {schema.scoring.enabled && <Input type="number" className="w-20" value={c.points ?? 0} onChange={(e) => patchQ(q.id, { choices: q.choices!.map((x) => (x.id === c.id ? { ...x, points: Number(e.target.value) || 0 } : x)) })} />}
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => patchQ(q.id, { choices: q.choices!.filter((x) => x.id !== c.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => patchQ(q.id, { choices: [...(q.choices ?? []), { id: uid(), label: "" }] })}><Plus className="h-3.5 w-3.5" /> Add choice</Button>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="logic" className="space-y-3 pt-3">
                  <p className="text-xs text-muted-foreground">Rules run top to bottom after this question is answered. The first match wins. No match = next question in order.</p>
                  {schema.logic.filter((r) => r.question_id === q.id).map((r) => (
                    <RuleRow key={r.id} rule={r} q={q} schema={schema} onChange={(patch) => patchSchema((s) => ({ ...s, logic: s.logic.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }))} onDelete={() => patchSchema((s) => ({ ...s, logic: s.logic.filter((x) => x.id !== r.id) }))} />
                  ))}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => patchSchema((s) => ({ ...s, logic: [...s.logic, { id: uid(), question_id: q.id, op: hasChoices(q.type) ? "eq" : "answered", value: q.choices?.[0]?.label ?? "", action: "end", target: s.default_ending } as LogicRule] }))}><Plus className="h-3.5 w-3.5" /> Add rule</Button>
                </TabsContent>
              </Tabs>
            )}

            {selected?.startsWith("end:") && (() => {
              const e = schema.endings.find((x) => `end:${x.id}` === selected); if (!e) return null;
              const patchE = (patch: Partial<Ending>) => patchSchema((s) => ({ ...s, endings: s.endings.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) }));
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><h2 className="font-medium">Ending</h2>
                    <label className="ml-auto flex items-center gap-2 text-xs"><Switch checked={schema.default_ending === e.id} onCheckedChange={(v) => v && patchSchema((s) => ({ ...s, default_ending: e.id }))} /> Default ending</label>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={schema.endings.length <= 1} onClick={() => { patchSchema((s) => ({ ...s, endings: s.endings.filter((x) => x.id !== e.id), default_ending: s.default_ending === e.id ? s.endings.find((x) => x.id !== e.id)!.id : s.default_ending, logic: s.logic.filter((r) => r.target !== e.id) })); setSelected(null); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="What happens"><Select value={e.kind} onValueChange={(v) => patchE({ kind: v as Ending["kind"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="message">Show a message</SelectItem><SelectItem value="booking">Book a call (Vexon OS event)</SelectItem><SelectItem value="redirect">Send to a URL</SelectItem></SelectContent></Select></Field>
                    <Field label="Outcome tag" hint="qualified, price_qualified, unqualified, shortlisted, rejected…"><Input value={e.outcome ?? ""} onChange={(ev) => patchE({ outcome: ev.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} /></Field>
                  </div>
                  <Field label="Title" hint="Use @key to recall an answer, e.g. Thanks, @first_name"><Input value={e.title} onChange={(ev) => patchE({ title: ev.target.value })} /></Field>
                  <Field label="Text"><Textarea value={e.body ?? ""} onChange={(ev) => patchE({ body: ev.target.value })} /></Field>
                  <MediaFields formId={id} media={e.media} onChange={(m) => patchE({ media: m })} />
                  {e.kind === "booking" && <Field label="Booking event slug" hint="e.g. discovery-call. Opens the lite widget prefilled from name/email/phone/company keys."><Input value={e.event_slug ?? ""} onChange={(ev) => patchE({ event_slug: ev.target.value.trim() })} /></Field>}
                  {e.kind === "redirect" && (<>
                    <Field label="URL"><Input value={e.url ?? ""} onChange={(ev) => patchE({ url: ev.target.value.trim() })} placeholder="https://meridiansales.example/confirmation1" /></Field>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={!!e.append_answers} onCheckedChange={(v) => patchE({ append_answers: v })} /> Append answers to the URL (?name=…&email=…)</label>
                  </>)}
                </div>
              );
            })()}

            {selected === "__settings" && (
              <div className="space-y-4">
                <h2 className="font-medium">Form settings</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><Input value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} /></Field>
                  <Field label="Link" hint="vexon-os.example/f/…"><Input value={meta.slug} onChange={(e) => { setMeta({ ...meta, slug: slugify(e.target.value) }); setDirty(true); }} /></Field>
                  <Field label="Kind"><Select value={meta.kind} onValueChange={(v) => { setMeta({ ...meta, kind: v as FormKind }); setDirty(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lead">Lead form</SelectItem><SelectItem value="hiring">Hiring form</SelectItem><SelectItem value="general">General</SelectItem></SelectContent></Select></Field>
                  <Field label="Where answers go"><Select value={meta.sink} onValueChange={(v) => { setMeta({ ...meta, sink: v as FormSink }); setDirty(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">This form's responses only</SelectItem><SelectItem value="marketing_leads">Marketing Leads (Tom)</SelectItem><SelectItem value="cv_screenings">Talent Acquisition screening list (Elena)</SelectItem></SelectContent></Select></Field>
                  <Field label="Notify role" hint="Bell for a role on each response: ops, setter, csm, admin… blank = nobody"><Input value={meta.notify_role} onChange={(e) => { setMeta({ ...meta, notify_role: e.target.value.trim() }); setDirty(true); }} /></Field>
                  <Field label="Webhook URL" hint="Optional. Zapier / n8n / Kit receive every completed response as JSON."><Input value={meta.webhook_url} onChange={(e) => { setMeta({ ...meta, webhook_url: e.target.value }); setDirty(true); }} placeholder="https://hooks.zapier.com/…" /></Field>
                  <Field label="Email every response to" hint="Comma-separated. Each completed response is emailed with all the answers."><Input value={meta.notify_emails} onChange={(e) => { setMeta({ ...meta, notify_emails: e.target.value }); setDirty(true); }} placeholder="elena@meridiansales.example, marcus@meridiansales.example" /></Field>
                  <Field label="Look" hint="Aurora = the brand wash on white behind a glass card (default). Aurora dark = the same on navy. Plain = flat; embeds on a website always use plain."><Select value={meta.appearance} onValueChange={(v) => { setMeta({ ...meta, appearance: v as typeof meta.appearance }); setDirty(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Aurora (default)</SelectItem><SelectItem value="aurora">Aurora dark</SelectItem><SelectItem value="plain">Plain</SelectItem></SelectContent></Select></Field>
                  <Field label="Accent colour" hint="Hex. Used for the OK button glow; blank = brand gradient"><Input value={meta.accent} onChange={(e) => { setMeta({ ...meta, accent: e.target.value.trim() }); setDirty(true); }} placeholder="#5a5a5a" /></Field>
                  <Field label="Hidden fields" hint="Comma-separated. Read from the link (?utm_source=…) and stored with the response."><Input value={schema.hidden.join(", ")} onChange={(e) => patchSchema((s) => ({ ...s, hidden: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} /></Field>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={schema.scoring.enabled} onCheckedChange={(v) => patchSchema((s) => ({ ...s, scoring: { ...s.scoring, enabled: v } }))} /> Scoring</label>
                  <p className="mt-1 text-xs text-muted-foreground">Give each choice points on its question. Plus points reward, minus points knock down (Elena's Typeform: +10 for the right answer, −50 for a deal-breaker). The score is shown as a share of the best possible total, so if the best answers add up to 100 the percentage is simply the points. Responses below the threshold are flagged and hidden by default in Responses.</p>
                  {schema.scoring.enabled && <p className="mt-2 text-xs"><span className="font-medium">Best possible total on this form:</span> {maxPoints} points{maxPoints === 100 ? ", so the percentage and the points read the same" : ""}.</p>}
                  {schema.scoring.enabled && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Threshold %"><Input type="number" min={0} max={100} value={schema.scoring.threshold_pct} onChange={(e) => patchSchema((s) => ({ ...s, scoring: { ...s.scoring, threshold_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))} /></Field>
                      <Field label="Ending when below threshold"><Select value={schema.scoring.below_threshold_ending ?? "__none"} onValueChange={(v) => patchSchema((s) => ({ ...s, scoring: { ...s.scoring, below_threshold_ending: v === "__none" ? null : v } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Same as default</SelectItem>{schema.endings.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent></Select></Field>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={meta.close_push} onCheckedChange={(v) => { setMeta({ ...meta, close_push: v }); setDirty(true); }} /> Push to Close</label>
                  <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={meta.branding} onCheckedChange={(v) => { setMeta({ ...meta, branding: v }); setDirty(true); }} /> Show Meridian branding <span className="text-xs font-normal text-muted-foreground">(logo at the top, "Powered by Enquire" at the bottom)</span></label>
                  <p className="mt-1 text-xs text-muted-foreground">Shows a "Push to Close" button on each response and "Push all shown" on the list. Hiring forms go to the Human Resources Close org, everything else to the sales org. A pushed response remembers its lead, so it is never sent twice.</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">Version history</p>
                  <p className="mt-1 text-xs text-muted-foreground">Every Publish is kept. Restore copies that version into the draft; Publish again to make it live.</p>
                  {(versions.data ?? []).length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Not published yet.</p> : (
                    <ul className="mt-2 divide-y divide-border text-xs">
                      {(versions.data ?? []).map((v) => (
                        <li key={v.id} className="flex items-center gap-3 py-1.5">
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-muted-foreground">{format(new Date(v.published_at), "EEE d MMM yyyy HH:mm")} · {Array.isArray(v.schema?.questions) ? v.schema.questions.length : 0} questions</span>
                          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => { if (confirm(`Replace the draft with version ${v.version}? Nothing goes live until you Publish.`)) { patchSchema(() => ({ ...emptySchema(), ...v.schema })); toast.success(`Draft is now version ${v.version}. Save or Publish when ready.`); } }}>Restore</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Embed on a website</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{`<iframe src="${formPublicUrl(form.slug)}?embed=1" style="width:100%;min-height:560px;border:0"></iframe>`}</pre>
                  <p className="mt-1">The frame posts <code>vexon-form-height</code>, <code>vexon-form-complete</code> and relays <code>vexon-booking-complete</code>.</p>
                </div>
              </div>
            )}

            {!selected && <p className="text-sm text-muted-foreground">Pick a question, an ending, or the settings.</p>}
          </section>
        </div>
        </div>
    </>
  );
}

function MediaFields({ media, withPosition, onChange, formId }: { media?: Media | null; withPosition?: boolean; onChange: (m: Media | null) => void; formId?: string }) {
  const url = media?.url ?? "";
  const [uploading, setUploading] = useState(false);
  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <div className={cn("grid gap-3", withPosition ? "sm:grid-cols-[1fr_1fr_150px]" : "sm:grid-cols-2")}>
        <Field label="Picture or video" hint={url ? `Shows as ${mediaKindLabel(url)}` : "Paste a link (image, YouTube, Loom, Vimeo, .mp4) or upload a file"}>
          <div className="flex gap-2">
            <Input value={url} placeholder="https://…" onChange={(e) => { const v = e.target.value.trim(); onChange(v ? { ...(media ?? {}), url: v } : null); }} />
            <label className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-md border border-input px-3 text-xs hover:bg-muted">
              <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f || !formId) return;
                if (f.size > 25 * 1024 * 1024) { toast.error("Keep uploads under 25 MB"); return; }
                setUploading(true);
                try { onChange({ ...(media ?? {}), url: await uploadFormMedia(formId, f) }); toast.success("Uploaded"); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
                finally { setUploading(false); }
              }} />
              {uploading ? "Uploading…" : "Upload"}
            </label>
          </div>
        </Field>
        <Field label="Caption / alt text"><Input value={media?.alt ?? ""} disabled={!url} onChange={(e) => onChange({ ...(media ?? { url }), url, alt: e.target.value })} /></Field>
        {withPosition && (
          <Field label="Where"><Select value={media?.position ?? "above"} disabled={!url} onValueChange={(v) => onChange({ ...(media ?? { url }), url, position: v as Media["position"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="above">Above the question</SelectItem><SelectItem value="side">Beside it</SelectItem></SelectContent></Select></Field>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>;
}

function RuleRow({ rule, q, schema, onChange, onDelete }: { rule: LogicRule; q: Question; schema: FormSchema; onChange: (p: Partial<LogicRule>) => void; onDelete: () => void }) {
  const needsValue = rule.op === "eq" || rule.op === "neq" || rule.op === "in";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
      <span className="text-muted-foreground">If answer</span>
      <Select value={rule.op} onValueChange={(v) => onChange({ op: v as LogicRule["op"] })}><SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="eq">is</SelectItem><SelectItem value="neq">is not</SelectItem><SelectItem value="in">is one of</SelectItem><SelectItem value="answered">is answered</SelectItem><SelectItem value="not_answered">is empty</SelectItem></SelectContent></Select>
      {needsValue && (hasChoices(q.type) && rule.op !== "in" ? (
        <Select value={String(rule.value ?? "")} onValueChange={(v) => onChange({ value: v })}><SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="choice" /></SelectTrigger><SelectContent>{(q.choices ?? []).map((c) => <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>)}</SelectContent></Select>
      ) : (
        <Input className="h-8 w-[200px]" value={Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value ?? "")} placeholder={rule.op === "in" ? "a, b, c" : "value"} onChange={(e) => onChange({ value: rule.op === "in" ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : e.target.value })} />
      ))}
      <span className="text-muted-foreground">then</span>
      <Select value={`${rule.action}:${rule.target}`} onValueChange={(v) => { const [action, target] = v.split(/:(.*)/s); onChange({ action: action as LogicRule["action"], target }); }}>
        <SelectTrigger className="h-8 w-[240px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {schema.questions.filter((x) => x.id !== q.id).map((x, i) => <SelectItem key={x.id} value={`jump:${x.id}`}>Jump to: {schema.questions.indexOf(x) + 1}. {x.title || "Untitled"}{i < 0 ? "" : ""}</SelectItem>)}
          {schema.endings.map((e) => <SelectItem key={e.id} value={`end:${e.id}`}>End: {e.title}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

/** One row in the question list: the grip drags, the rest of the row selects. */
function SortableQuestionRow({ id, index, title, hasLogic, selected, onSelect }: {
  id: string; index: number; title: string; hasLogic: boolean; selected: boolean; onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-80")}>
      <div className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40", selected && "bg-muted/60")}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder question ${index + 1}`}
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0" />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{title || <i className="text-muted-foreground">Untitled</i>}</span>
          {hasLogic && <span className="text-[10px] text-primary">logic</span>}
        </button>
      </div>
    </li>
  );
}
