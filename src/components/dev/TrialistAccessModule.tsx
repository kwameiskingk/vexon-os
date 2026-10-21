// Dev Centre → Trialist access (15 Sep 2026, Trial Day).
//
// Everything Elena can do from the candidate card, plus the parts only the
// dev needs: every trialist login and its state, the full lead log with
// status filters, and the briefing settings the trialist portal reads
// (Google Doc + video links today; embedded content when Marcus's material
// lands).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { FlaskConical, GripVertical, KeyRound, Loader2, LogOut, MailCheck, Plus, Save, Settings2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/hiringPipeline";
import { TrialLeadCard } from "@/components/csm/TrialLeadCard";
import { BookTrialLeadDialog } from "@/components/csm/BookTrialLeadDialog";
import {
  DEFAULT_TRIAL_DAY_SETTINGS,
  trialLeadStatusLabel,
  useAllTrialLeads,
  useCreateTrialistLogin,
  useEndTrialAccess,
  useSaveTrialDaySettings,
  useSendTrialistInvite,
  useTrialDaySettings,
  useTrialists,
  type TrialDaySettings,
  type TrialPackSection,
  type TrialLead,
  type TrialLeadStatus,
  type TrialistRow,
} from "@/hooks/useTrialDay";

export function TrialistAccessModule() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <FlaskConical className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Trialist access</h2>
          <p className="text-sm text-muted-foreground">
            Trial-day logins, everything they log, and what the trial portal shows them.
          </p>
        </div>
        <div className="flex-1" />
        {/* The whole hand-off on in-memory state: trialist → Daniel → Jordan. */}
        <a className="dc-btn dc-btn-primary shrink-0" href="/trial/sandbox" target="_blank" rel="noreferrer">
          Run the flow (sandbox) ↗
        </a>
      </div>
      <Tabs defaultValue="trialists">
        <TabsList>
          <TabsTrigger value="trialists" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Trialists
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Lead log
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Portal briefing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="trialists" className="mt-4">
          <TrialistsPanel />
        </TabsContent>
        <TabsContent value="leads" className="mt-4">
          <LeadLogPanel />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Trialists ──────────────────────────────────────────────────────────────

function TrialistsPanel() {
  const { data: rows = [], isLoading } = useTrialists();
  const create = useCreateTrialistLogin();
  const invite = useSendTrialistInvite();
  const endAccess = useEndTrialAccess();
  const [createFor, setCreateFor] = useState<TrialistRow | null>(null);
  const [email, setEmail] = useState("");

  const stateOf = (r: TrialistRow): { label: string; cls: string } => {
    if (!r.trialist_user_id) return { label: "No login", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    if (r.profile?.in_trial_mode) return { label: "Login live", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    return { label: "Access ended / moved on", cls: "bg-muted text-muted-foreground" };
  };

  const doCreate = async () => {
    if (!createFor) return;
    const name = `${createFor.first_name} ${createFor.last_name}`.trim();
    try {
      await create.mutateAsync({ candidateId: createFor.candidate_id, email: email.trim(), displayName: name });
      setCreateFor(null);
      try {
        await invite.mutateAsync({ email: email.trim(), fullName: name });
        toast.success(`Login created and invite sent to ${email.trim()}`);
      } catch (err) {
        toast.warning(`Login created; invite failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the login");
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No trialists yet. Move a candidate to Trial Day in Ops Command → Talent Acquisition, or create a login from here
        once they are at that stage.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Candidate</th>
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-left">Trial date</th>
            <th className="px-3 py-2 text-left">Login</th>
            <th className="px-3 py-2 text-left">State</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => {
            const st = stateOf(r);
            const name = `${r.first_name} ${r.last_name}`.trim();
            return (
              <tr key={r.candidate_id}>
                <td className="px-3 py-2">
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{r.email}</p>
                </td>
                <td className="px-3 py-2">{stageLabel(r.stage_key)}</td>
                <td className="px-3 py-2">{r.trial_day_date ? format(parseISO(r.trial_day_date), "EEE d MMM") : "—"}</td>
                <td className="px-3 py-2 text-xs">{r.profile?.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}>{st.label}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    {!r.trialist_user_id ? (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setEmail(r.email); setCreateFor(r); }}>
                        <KeyRound className="h-3 w-3" /> Create login
                      </Button>
                    ) : r.profile?.in_trial_mode ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={invite.isPending}
                          onClick={async () => {
                            try {
                              await invite.mutateAsync({ email: r.profile?.email ?? r.email, fullName: name });
                              toast.success("Invite sent");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Invite failed");
                            }
                          }}
                        >
                          <MailCheck className="h-3 w-3" /> Resend invite
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          disabled={endAccess.isPending}
                          onClick={async () => {
                            if (!window.confirm(`End trial access for ${name}? They can no longer sign in.`)) return;
                            try {
                              await endAccess.mutateAsync(r.candidate_id);
                              toast.success("Access ended");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Couldn't end access");
                            }
                          }}
                        >
                          <LogOut className="h-3 w-3" /> End access
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={!!createFor} onOpenChange={(o) => !o && !create.isPending && setCreateFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create trialist login</DialogTitle>
            <DialogDescription>
              {createFor ? `${createFor.first_name} ${createFor.last_name}` : ""} gets a login that can only reach the trial
              portal, and a set-password email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dev-trialist-email">Email</Label>
            <Input id="dev-trialist-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFor(null)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={doCreate} disabled={create.isPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create & invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Lead log ───────────────────────────────────────────────────────────────

const STATUSES: Array<TrialLeadStatus | "all"> = ["all", "submitted", "pushed", "converted", "rejected"];

function LeadLogPanel() {
  const { data: leads = [], isLoading, refetch } = useAllTrialLeads();
  const [filter, setFilter] = useState<TrialLeadStatus | "all">("all");
  const [bookLead, setBookLead] = useState<TrialLead | null>(null);

  const visible = useMemo(() => (filter === "all" ? leads : leads.filter((l) => l.status === filter)), [leads, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {s === "all" ? "All" : trialLeadStatusLabel[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {visible.map((l) => (
              <TrialLeadCard key={l.id} lead={l} onBook={setBookLead} />
            ))}
          </div>
        )}
      </div>
      <BookTrialLeadDialog
        lead={bookLead}
        open={!!bookLead}
        onOpenChange={(o) => { if (!o) { setBookLead(null); refetch(); } }}
      />
    </div>
  );
}

// ── Portal briefing ────────────────────────────────────────────────────────

function SettingsPanel() {
  const { data, isLoading } = useTrialDaySettings();
  const save = useSaveTrialDaySettings();
  const [draft, setDraft] = useState<TrialDaySettings>(DEFAULT_TRIAL_DAY_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data || dirty) return;
    setDraft({ ...DEFAULT_TRIAL_DAY_SETTINGS, ...data });
  }, [data, dirty]);

  const set = <K extends keyof TrialDaySettings>(k: K, v: TrialDaySettings[K]) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const doSave = async () => {
    try {
      await save.mutateAsync(draft);
      setDirty(false);
      toast.success("Saved — the trial portal shows this now.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="ts-title">Panel title</Label>
          <Input id="ts-title" value={draft.intro_title} onChange={(e) => set("intro_title", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ts-body">Panel text</Label>
          <Textarea id="ts-body" rows={5} value={draft.intro_body} onChange={(e) => set("intro_body", e.target.value)} />
          <p className="text-xs text-muted-foreground">Line breaks are kept. Keep it to what they need on the morning.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ts-doc">Briefing document link</Label>
            <Input id="ts-doc" placeholder="https://docs.google.com/…" value={draft.doc_url ?? ""} onChange={(e) => set("doc_url", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-doc-label">Its button label</Label>
            <Input id="ts-doc-label" value={draft.doc_label} onChange={(e) => set("doc_label", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-video">Walkthrough video link</Label>
            <Input id="ts-video" placeholder="https://www.loom.com/share/…" value={draft.video_url ?? ""} onChange={(e) => set("video_url", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-video-label">Its button label</Label>
            <Input id="ts-video-label" value={draft.video_label} onChange={(e) => set("video_label", e.target.value)} />
          </div>
        </div>
        <SectionsEditor sections={draft.sections} onChange={(next) => set("sections", next)} />

        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Embed a video in the panel</span>
              <span className="block text-xs text-muted-foreground">
                For when Marcus hands over the material: plays inside the portal instead of a link.
              </span>
            </span>
            <Switch checked={draft.embed_mode} onCheckedChange={(v) => set("embed_mode", v)} />
          </label>
          {draft.embed_mode && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ts-embed">Video URL (YouTube, Loom, Wistia embed)</Label>
                <Input id="ts-embed" value={draft.embed_video_url ?? ""} onChange={(e) => set("embed_video_url", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ts-embed-title">Caption</Label>
                <Input id="ts-embed-title" value={draft.embed_title ?? ""} onChange={(e) => set("embed_title", e.target.value || null)} />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={doSave} disabled={!dirty || save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      {/* Live preview of the panel as the trialist sees it. */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-1 w-full bg-gradient-button" />
          <div className="space-y-3 p-4">
            <p className="font-heading text-base font-semibold">{draft.intro_title || "How today works"}</p>
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{draft.intro_body}</p>
            {draft.sections.filter((x) => x.title.trim()).length > 0 && (
              <ol className="space-y-1 text-xs">
                {draft.sections.filter((x) => x.title.trim()).map((x, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-button text-[9px] font-bold text-white">{i + 1}</span>
                    <span className={cn(!x.body.trim() && !x.url.trim() && "text-muted-foreground")}>{x.title}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap gap-1.5">
              {draft.doc_url && <Badge variant="outline">{draft.doc_label || "Trial-day briefing"}</Badge>}
              {draft.video_url && <Badge variant="outline">{draft.video_label || "Close walkthrough"}</Badge>}
              {draft.embed_mode && draft.embed_video_url && <Badge variant="outline">▶ embedded video</Badge>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Trial-day pack editor ──────────────────────────────────────────────────

const EMPTY_SECTION: TrialPackSection = { title: "", body: "", url: "", url_label: "" };

function SectionsEditor({ sections, onChange }: { sections: TrialPackSection[]; onChange: (next: TrialPackSection[]) => void }) {
  const setAt = (i: number, patch: Partial<TrialPackSection>) => onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Trial-day pack</p>
          <p className="text-xs text-muted-foreground">
            Marcus's list, one card each. Text, a link, or a video (YouTube/Loom links play inside the card). Empty ones show as "Coming from Marcus".
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => onChange([...sections, { ...EMPTY_SECTION }])}>
          <Plus className="h-3.5 w-3.5" /> Add card
        </Button>
      </div>
      {sections.length === 0 && <p className="text-xs text-muted-foreground">No cards yet.</p>}
      {sections.map((sec, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-button text-[10px] font-bold text-white">{i + 1}</span>
            <Input placeholder="Card title" value={sec.title} onChange={(e) => setAt(i, { title: e.target.value })} className="h-8" />
            <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><GripVertical className="h-4 w-4 rotate-90" /></button>
            <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === sections.length - 1} onClick={() => move(i, 1)} title="Move down"><GripVertical className="h-4 w-4 -rotate-90" /></button>
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(sections.filter((_, j) => j !== i))} title="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea rows={2} placeholder="What they read when they open the card" value={sec.body} onChange={(e) => setAt(i, { body: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <Input placeholder="Link or video URL (optional)" value={sec.url} onChange={(e) => setAt(i, { url: e.target.value })} className="h-8" />
            <Input placeholder="Link label" value={sec.url_label} onChange={(e) => setAt(i, { url_label: e.target.value })} className="h-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
