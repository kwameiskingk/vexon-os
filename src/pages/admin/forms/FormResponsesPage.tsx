// Enquire (Vexon OS Forms) - responses for one form: table, threshold filter, detail, CSV.
import { onboardingAnswerFlags } from "@/lib/forms/onboardingFlags";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { CheckCircle2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { EnquireHead } from "@/components/forms/EnquireHead";
import { useEnquireNav } from "@/lib/forms/enquireNav";
import { Button } from "@/components/ui/button";
import { ButtonV2, Chip, Pill } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { pushResponsesToClose, useDeleteResponse, useForm, useFormResponses, useUpdateResponse } from "@/hooks/useForms";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { answersByTitle, compositeText, type FormResponseRow, type FormSchema } from "@/lib/forms/schema";

export default function FormResponsesPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <FormResponsesBody id={id} openToken={params.get("open")} />
      </PageContainer>
    </DashboardLayout>
  );
}

/** The responses screen itself: on the page above and inside the Dev Centre.
 * `openToken` opens one response straight away (the link from a Marketing Hub lead). */
export function FormResponsesBody({ id, openToken }: { id?: string; openToken?: string | null }) {
  const go = useEnquireNav();
  const { data: form } = useForm(id);
  const { data: rows = [], isLoading } = useFormResponses(id);
  const del = useDeleteResponse();
  const upd = useUpdateResponse();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tagFilter, setTagFilter] = useState<string>("");
  const [hideReviewed, setHideReviewed] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [pushing, setPushing] = useState(false);
  const schema: FormSchema | null = form?.published_schema ?? form?.schema ?? null;
  const scoring = schema?.scoring?.enabled;
  const [aboveOnly, setAboveOnly] = useState(true);
  const [showPartial, setShowPartial] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [openRow, setOpenRow] = useState<FormResponseRow | null>(null);
  const [search, setSearch] = useState("");
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (!openToken || openedFromLink.current || rows.length === 0) return;
    const r = rows.find((x) => x.token === openToken);
    if (r) { setOpenRow(r); openedFromLink.current = true; }
  }, [openToken, rows]);

  // Search covers every answer, not just the name (Elena searches Typeform responses the same way).
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((r) =>
    (showPartial || !r.is_partial) && (showTest || !r.is_test) &&
    (!scoring || !aboveOnly || r.score_pct === null || r.score_pct >= (schema?.scoring.threshold_pct ?? 0)) &&
    (!tagFilter || (r.tags ?? []).includes(tagFilter)) && (!hideReviewed || !r.reviewed_at) &&
    (!needle || Object.values(r.answers).some((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "object" && v ? String((v as { name?: string }).name ?? "") : String(v ?? "")).toLowerCase().includes(needle)))
  ), [rows, showPartial, showTest, scoring, aboveOnly, schema, needle, tagFilter, hideReviewed]);
  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.tags ?? []))).sort(), [rows]);
  const setTags = (r: FormResponseRow, tags: string[]) => { upd.mutate({ id: r.id, patch: { tags } }); setOpenRow({ ...r, tags }); };
  const toggleReviewed = (r: FormResponseRow) => { const reviewed_at = r.reviewed_at ? null : new Date().toISOString(); upd.mutate({ id: r.id, patch: { reviewed_at, reviewed_by: reviewed_at ? user?.id ?? null : null } }); setOpenRow({ ...r, reviewed_at }); };
  const push = async (ids: string[]) => {
    if (!ids.length) return;
    setPushing(true);
    try {
      const res = await pushResponsesToClose(ids);
      const ok = res.results.filter((x) => x.ok && !x.skipped).length, skipped = res.results.filter((x) => x.skipped).length, failed = res.results.filter((x) => !x.ok);
      if (failed.length) toast.error(`${failed.length} failed: ${failed[0].error}`);
      if (ok || skipped) toast.success(`${ok} pushed to Close${skipped ? `, ${skipped} already there` : ""}`);
      qc.invalidateQueries({ queryKey: ["form-responses"] });
      if (openRow) { const mine = res.results.find((x) => x.id === openRow.id); if (mine?.lead_id) setOpenRow({ ...openRow, close_lead_id: mine.lead_id }); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Push failed"); }
    finally { setPushing(false); }
  };
  const closeOrg = form?.kind === "hiring" ? "Human Resources" : "sales";

  const who = (r: FormResponseRow) => {
    if (!schema) return r.token;
    const byRef: Record<string, string> = {};
    for (const q of schema.questions) { const v = r.answers[q.id]; if (typeof v === "string" && v) byRef[q.ref] = v; else if (v && typeof v === "object" && !Array.isArray(v)) byRef[q.ref] = compositeText(v); }
    return byRef.name || byRef.your_name || `${byRef.first_name ?? ""} ${byRef.last_name ?? ""}`.trim() || byRef.company_name || byRef.email || byRef.company || "-";
  };
  const email = (r: FormResponseRow) => { const q = schema?.questions.find((x) => x.ref === "email"); const v = q ? r.answers[q.id] : ""; return typeof v === "string" ? v : ""; };
  const dobQ = schema?.questions.find((x) => x.ref === "date_of_birth" || x.ref === "dob");
  const age = (r: FormResponseRow): number | null => {
    const v = dobQ ? r.answers[dobQ.id] : null;
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v); if (Number.isNaN(d.getTime())) return null;
    const now = new Date(); let a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a >= 0 && a < 120 ? a : null;
  };
  const threshold = schema?.scoring.threshold_pct ?? 0;
  const complete = rows.filter((r) => !r.is_partial && !r.is_test);
  const nAbove = complete.filter((r) => r.score_pct === null || r.score_pct >= threshold).length;
  const nPartial = rows.filter((r) => r.is_partial).length;
  const nTest = rows.filter((r) => r.is_test).length;

  const exportCsv = () => {
    if (!schema) return;
    const cols = ["Submitted", "Outcome", "Score %", ...schema.questions.filter((q) => q.type !== "statement").map((q) => q.title), ...schema.hidden];
    const lines = [cols, ...visible.map((r) => {
      const t = answersByTitle(schema, r.answers);
      return [r.completed_at ?? r.created_at, r.outcome ?? "", r.score_pct ?? "", ...schema.questions.filter((q) => q.type !== "statement").map((q) => t[q.title] ?? ""), ...schema.hidden.map((h) => r.hidden[h] ?? "")];
    })].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" })); a.download = `${form?.slug ?? "form"}-responses.csv`; a.click();
  };

  return (
    <>
        <EnquireHead
          eyebrow="Enquire · responses"
          title={form?.name ?? "Responses"}
          subtitle={`${visible.length} shown · ${rows.filter((r) => !r.is_partial && !r.is_test).length} completed · ${rows.filter((r) => r.is_partial).length} partial`}
          actions={<div className="flex flex-wrap items-center gap-[6px]">
            <ButtonV2 size="sm" variant="ghost" onClick={() => id && go({ view: "editor", id })}>← Builder</ButtonV2>
            {form?.close_push && <ButtonV2 size="sm" disabled={pushing || !visible.length} onClick={() => { const ids = visible.filter((r) => !r.close_lead_id && !r.is_test && !r.is_partial).map((r) => r.id); if (!ids.length) { toast.message("Everyone shown is already in Close"); return; } if (confirm(`Push ${ids.length} response${ids.length === 1 ? "" : "s"} to the ${closeOrg} Close org?`)) void push(ids); }}>{pushing ? "Pushing…" : "Push all shown to Close"}</ButtonV2>}
            <ButtonV2 size="sm" onClick={exportCsv} disabled={!visible.length}>CSV</ButtonV2>
          </div>}
        />
        <div className="space-y-4">
        <div className="space-y-2 rounded-[8px] bg-[var(--surf2)] px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {scoring && (
              <div className="flex gap-[6px]">
                <Chip selected={aboveOnly} onClick={() => setAboveOnly(true)}>Scored {threshold}%+ · {nAbove}</Chip>
                <Chip selected={!aboveOnly} onClick={() => setAboveOnly(false)}>Everyone who finished · {complete.length}</Chip>
              </div>
            )}
            <label className="flex items-center gap-2 text-xs"><Switch checked={showPartial} onCheckedChange={setShowPartial} /><Label className="text-xs">Include people who dropped off halfway ({nPartial})</Label></label>
            <label className="flex items-center gap-2 text-xs"><Switch checked={showTest} onCheckedChange={setShowTest} /><Label className="text-xs">Include test runs from Preview ({nTest})</Label></label>
            <label className="flex items-center gap-2 text-xs"><Switch checked={hideReviewed} onCheckedChange={setHideReviewed} /><Label className="text-xs">Hide ones I've reviewed</Label></label>
            {allTags.length > 0 && (
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="">Any tag</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <Input className="ml-auto h-8 w-full sm:w-64" placeholder="Search any answer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {scoring && aboveOnly && nAbove === 0 && complete.length > 0 && <p className="text-xs text-muted-foreground">Nobody has scored {threshold}% or more yet. Switch to "Everyone who finished" to see the {complete.length} below the line.</p>}
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : visible.length === 0 ? (
          <p className="border-t border-[var(--line)] py-10 text-center text-[12px] text-[var(--dim)]">Nothing here yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Who</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Outcome</th>{scoring && <th className="px-3 py-2">Score</th>}{dobQ && <th className="px-3 py-2">Age</th>}<th className="px-3 py-2">Tags</th><th className="px-3 py-2">When</th><th /></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setOpenRow(r)}>
                    <td className="px-3 py-2 font-medium">{r.reviewed_at && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" aria-label="Reviewed" />}{who(r)} {r.is_test && <Pill>test</Pill>}{r.is_partial && <Pill>partial</Pill>}{r.close_lead_id && <Pill>in Close</Pill>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{email(r)}</td>
                    <td className="px-3 py-2">{r.outcome ? <Pill>{r.outcome.replace(/_/g, " ")}</Pill> : "-"}</td>
                    {scoring && <td className={cn("px-3 py-2 tabular-nums", r.score_pct !== null && r.score_pct < (schema?.scoring.threshold_pct ?? 0) && "text-amber-600")}>{r.score_pct ?? "-"}{r.score_pct !== null && "%"}{r.score !== null && r.max_score !== null && <span className="ml-1 text-xs text-muted-foreground">{r.score}/{r.max_score}</span>}</td>}
                    {dobQ && <td className="px-3 py-2 tabular-nums text-muted-foreground">{age(r) ?? "-"}</td>}
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{(r.tags ?? []).map((t) => <Pill>{t}</Pill>)}</div></td>
                    <td className="px-3 py-2 text-muted-foreground">{format(new Date(r.completed_at ?? r.created_at), "d MMM HH:mm")}</td>
                    <td className="px-2 py-2"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("Delete this response?")) del.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>

      <Sheet open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {openRow && schema && (
            <>
              <SheetHeader><SheetTitle>{who(openRow)}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {openRow.outcome && <Pill>{openRow.outcome.replace(/_/g, " ")}</Pill>}
                  {openRow.score_pct !== null && <Pill>Score {openRow.score_pct}% ({openRow.score}/{openRow.max_score})</Pill>}
                  <span className="text-muted-foreground">{format(new Date(openRow.completed_at ?? openRow.created_at), "EEE d MMM yyyy HH:mm")}</span>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ButtonV2 size="sm" variant={openRow.reviewed_at ? "primary" : "secondary"} onClick={() => toggleReviewed(openRow)}>{openRow.reviewed_at ? "Reviewed" : "Mark reviewed"}</ButtonV2>
                    {form?.close_push && (openRow.close_lead_id ? (
                      <ButtonV2 size="sm" onClick={() => window.open(`https://app.close.com/lead/${openRow.close_lead_id}/`, "_blank", "noopener")}>Open in Close</ButtonV2>
                    ) : (
                      <ButtonV2 size="sm" variant="primary" disabled={pushing || openRow.is_test} onClick={() => void push([openRow.id])}>{pushing ? "Pushing…" : `Push to Close (${closeOrg})`}</ButtonV2>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(openRow.tags ?? []).map((t) => <Pill className="gap-1">{t}<button type="button" onClick={() => setTags(openRow, (openRow.tags ?? []).filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button></Pill>)}
                    <Input className="h-7 w-40 text-xs" placeholder="Add a tag, Enter" value={tagDraft} list="enquire-tags" onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = tagDraft.trim(); if (t && !(openRow.tags ?? []).includes(t)) setTags(openRow, [...(openRow.tags ?? []), t]); setTagDraft(""); } }} />
                    <datalist id="enquire-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
                  </div>
                  <textarea className="w-full rounded-md border border-input bg-background p-2 text-xs" rows={2} placeholder="Notes (saved when you click away)" defaultValue={openRow.notes ?? ""} onBlur={(e) => { if (e.target.value !== (openRow.notes ?? "")) { upd.mutate({ id: openRow.id, patch: { notes: e.target.value } }); setOpenRow({ ...openRow, notes: e.target.value }); } }} />
                </div>
                {onboardingAnswerFlags(Object.fromEntries(schema.questions.map((q) => [q.ref, openRow.answers[q.id]]))).map((f) => (
                  <p key={f} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">⚑ {f}</p>
                ))}
                {schema.questions.filter((q) => q.type !== "statement").map((q) => {
                  const v = openRow.answers[q.id];
                  if (v === undefined || v === null || v === "") return null;
                  const shown = q.type === "file" ? (v as { name?: string; path?: string }) : null;
                  return (
                    <div key={q.id} className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">{q.title}</p>
                      <p className="mt-0.5 whitespace-pre-line font-medium">{shown ? <FileLink path={shown.path ?? ""} name={shown.name ?? "file"} /> : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? compositeText(v) : String(v)}</p>
                    </div>
                  );
                })}
                {Object.keys(openRow.hidden).length > 0 && <p className="text-xs text-muted-foreground">Hidden: {Object.entries(openRow.hidden).map(([k, v]) => `${k}=${v}`).join(" · ")}</p>}
                {openRow.cv_screening_id && <p className="text-xs text-muted-foreground">Screening row created. <Link className="underline" to="/ops-command/talent-acquisition">Open Talent Acquisition</Link></p>}
                {openRow.hidden.client_profile_id && <p className="text-xs text-muted-foreground">Client onboarding answers. <Link className="underline" to={`/admin/clients/${openRow.hidden.client_profile_id}`}>Open the client profile</Link> (also on its Documents tab).</p>}
                {openRow.marketing_lead_id && <p className="text-xs text-muted-foreground">Lead row created. <Link className="underline" to="/marketing/leads">Open Marketing Leads</Link></p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function FileLink({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const open = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.storage.from("form-uploads").createSignedUrl(path, 600);
    if (data?.signedUrl) { setUrl(data.signedUrl); window.open(data.signedUrl, "_blank"); }
  };
  return <button type="button" className="underline" onClick={open}>{name}{url ? "" : " ↗"}</button>;
}
