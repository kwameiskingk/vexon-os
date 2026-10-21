// Build log (15 Oct 2026): the record of everything built, who it was for,
// what it replaced, when it went live, how it is billed and the hours it saves
// per role. Replaces the Projects module (same dev_projects table, plus
// dev_project_hours). the owner appends a log entry at the end of every session.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ButtonV2, Chip, FactsStrip, MasterDetail, MasterRow, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import {
  BILLING_LABEL, CLIENT_LABEL, KIND_OPTIONS, STATUS_OPTIONS, WEEKS_PER_MONTH,
  isLive, money, round1, savedPerWeek,
  normaliseBuild, type BillingModel, type BuildClient, type BuildRow, type HoursRow,
} from "@/lib/devBuildLog";

// dev_project_hours and the new columns reach types.ts on the next the hosted builder sync.
const sb = supabase as unknown as SupabaseClient;

type RoleRow = { id: string; name: string };
type NoteRow = { id: string; body: string; author_name: string | null; created_at: string };

const statusTone = (s: string) => (s === "shipped" ? "ok" : s === "in_progress" ? "info" : s === "archived" ? "default" : "warn");
const kindLabel = (s: string) => KIND_OPTIONS.find((k) => k.id === s)?.label ?? s;

export function BuildLogModule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [clientFilter, setClientFilter] = useState<"all" | BuildClient>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "building" | "archived">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: builds = [], isLoading } = useQuery({
    queryKey: ["dev-builds"],
    queryFn: async () => {
      const { data, error } = await sb.from("dev_projects").select("*").order("rolled_out_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return ((data || []) as (Partial<BuildRow> & { id: string; title: string })[]).map(normaliseBuild);
    },
  });
  const { data: hours = [] } = useQuery({
    queryKey: ["dev-build-hours"],
    queryFn: async () => {
      const { data, error } = await sb.from("dev_project_hours").select("*").order("created_at");
      if (error) throw error;
      return (data || []) as HoursRow[];
    },
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["dev-roles-min"],
    queryFn: async () => {
      const { data } = await sb.from("dev_roles").select("id,name").order("name");
      return (data || []) as RoleRow[];
    },
  });

  const filtered = useMemo(() => builds.filter((b) => {
    if (clientFilter !== "all" && b.client !== clientFilter) return false;
    if (statusFilter === "live" && !isLive(b)) return false;
    if (statusFilter === "building" && (isLive(b) || b.status === "archived")) return false;
    if (statusFilter === "archived" && b.status !== "archived") return false;
    return true;
  }), [builds, clientFilter, statusFilter]);

  const selected = useMemo(() => builds.find((b) => b.id === selectedId) ?? null, [builds, selectedId]);
  const hoursFor = (id: string) => hours.filter((h) => h.project_id === id);
  const weekFor = (id: string) => hoursFor(id).reduce((s, h) => s + savedPerWeek(h), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dev-builds"] });
    qc.invalidateQueries({ queryKey: ["dev-build-hours"] });
    qc.invalidateQueries({ queryKey: ["dev-mc-builds"] });
  };

  const create = useMutation({
    mutationFn: async (input: { title: string; client: BuildClient; stream: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await sb.from("dev_projects").insert({ title: input.title, client: input.client, stream: input.stream, status: "planned", created_by: user.id }).select("id").single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (d) => { setCreating(false); setSelectedId(d.id); invalidate(); toast.success("Build logged"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = builds.filter(isLive);
  const strip = [
    { label: "Live", value: live.length, caption: `${builds.length - live.length} not yet live` },
    { label: "Meridian", value: live.filter((b) => b.client === "vexon").length, caption: `${round1(live.filter((b) => b.client === "vexon").reduce((s, b) => s + weekFor(b.id), 0))} hrs saved a week` },
    { label: "Northgate Recruitment", value: live.filter((b) => b.client === "northgate").length, caption: `${round1(live.filter((b) => b.client === "northgate").reduce((s, b) => s + weekFor(b.id), 0))} hrs saved a week` },
    { label: "Unbilled", value: builds.filter((b) => b.billing_model === "unbilled" && isLive(b)).length, caption: "Live, nothing charged" },
  ];

  const list = (
    <div>
      <div className="flex flex-wrap items-center gap-[6px] pb-3">
        {(["all", "vexon", "northgate"] as const).map((c) => (
          <Chip key={c} selected={clientFilter === c} onClick={() => setClientFilter(c)}>{c === "all" ? "All" : CLIENT_LABEL[c]}</Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        {(["all", "live", "building", "archived"] as const).map((s) => (
          <Chip key={s} selected={statusFilter === s} onClick={() => setStatusFilter(s)}>{s === "all" ? "Any status" : s[0].toUpperCase() + s.slice(1)}</Chip>
        ))}
      </div>
      <ButtonV2 size="sm" variant="primary" className="mb-3 w-full justify-center" onClick={() => { setCreating(true); setSelectedId(null); }}>Log a build</ButtonV2>
      {isLoading ? <p className="pt-4 text-[12px] text-[var(--dim)]">Loading…</p> : filtered.length === 0 ? (
        <p className="pt-4 text-[12px] text-[var(--dim)]">Nothing in this view.</p>
      ) : filtered.map((b) => (
        <MasterRow
          key={b.id}
          selected={selected?.id === b.id}
          onClick={() => { setCreating(false); setSelectedId(b.id); }}
          primary={<span className="flex items-center gap-2">{b.title}<Pill variant={statusTone(b.status)}>{b.status.replace("_", " ")}</Pill></span>}
          secondary={`${CLIENT_LABEL[b.client]} · ${kindLabel(b.stream)}${b.replaced ? ` · replaced ${b.replaced}` : ""}${b.rolled_out_date ? ` · live ${format(new Date(b.rolled_out_date), "d MMM yyyy")}` : ""}`}
          aside={<span>{weekFor(b.id) > 0 ? `${round1(weekFor(b.id))} h/wk` : b.fee_amount ? money(Number(b.fee_amount), b.fee_currency) : "—"}</span>}
        />
      ))}
    </div>
  );

  const detail = creating ? (
    <NewBuildForm onCancel={() => setCreating(false)} onCreate={(input) => create.mutate(input)} pending={create.isPending} />
  ) : selected ? (
    <BuildDetail key={selected.id} build={selected} hours={hoursFor(selected.id)} roles={roles} onChanged={invalidate} />
  ) : (
    <div className="pt-10 text-center text-[12px] text-[var(--dim)]">Pick a build, or log a new one.</div>
  );

  return (
    <div className="space-y-6">
      <StatStrip stats={strip} />
      <MasterDetail list={list} detail={detail} listWidth={320} />
    </div>
  );
}

/* ----------------------------- new build ----------------------------- */

function NewBuildForm({ onCancel, onCreate, pending }: { onCancel: () => void; onCreate: (i: { title: string; client: BuildClient; stream: string }) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [client, setClient] = useState<BuildClient>("vexon");
  const [stream, setStream] = useState<string>("application");
  return (
    <Panel title="Log a build" meta="Name it, say who it is for, then fill in the rest on the next screen">
      <div className="space-y-4 pt-3">
        <Field label="What did we build?"><input className="dc-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kronos (Calendly replacement)" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client"><select className="dc-select" value={client} onChange={(e) => setClient(e.target.value as BuildClient)}>{(Object.keys(CLIENT_LABEL) as BuildClient[]).map((c) => <option key={c} value={c}>{CLIENT_LABEL[c]}</option>)}</select></Field>
          <Field label="Kind"><select className="dc-select" value={stream} onChange={(e) => setStream(e.target.value)}>{KIND_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
        </div>
        <div className="flex gap-[6px]">
          <ButtonV2 variant="primary" size="sm" disabled={!title.trim() || pending} onClick={() => onCreate({ title: title.trim(), client, stream })}>Log it</ButtonV2>
          <ButtonV2 size="sm" onClick={onCancel}>Cancel</ButtonV2>
        </div>
      </div>
    </Panel>
  );
}

/* ----------------------------- detail ----------------------------- */

function BuildDetail({ build, hours, roles, onChanged }: { build: BuildRow; hours: HoursRow[]; roles: RoleRow[]; onChanged: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(build));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setForm(toForm(build)); setDirty(false); }, [build]);
  const patch = (p: Partial<typeof form>) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("dev_projects").update({
        title: form.title.trim(), description: form.description.trim() || null, client: form.client, stream: form.stream,
        status: form.status, replaced: form.replaced.trim() || null, owner: form.owner.trim() || null,
        rolled_out_date: form.rolled_out_date || null, billing_model: form.billing_model,
        fee_amount: form.fee_amount === "" ? null : Number(form.fee_amount), fee_currency: form.fee_currency,
        fee_month: form.fee_month ? `${form.fee_month}-01` : null,
        shipped_at: form.status === "shipped" ? (build.shipped_at ?? new Date().toISOString()) : build.shipped_at,
      }).eq("id", build.id);
      if (error) throw error;
    },
    onSuccess: () => { setDirty(false); onChanged(); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => { const { error } = await sb.from("dev_projects").delete().eq("id", build.id); if (error) throw error; },
    onSuccess: () => { onChanged(); toast.success("Build deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["dev-build-notes", build.id],
    queryFn: async () => {
      const { data } = await sb.from("dev_project_notes").select("id, body, author_name, created_at").eq("project_id", build.id).order("created_at", { ascending: false });
      return (data || []) as NoteRow[];
    },
  });
  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      if (!user || !note.trim()) return;
      const { error } = await sb.from("dev_project_notes").insert({ project_id: build.id, author_id: user.id, author_name: user.email, body: note.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["dev-build-notes", build.id] }); qc.invalidateQueries({ queryKey: ["dev-mc-project-notes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const week = hours.reduce((s, h) => s + savedPerWeek(h), 0);
  const facts = [
    { label: "Client", value: CLIENT_LABEL[build.client] },
    { label: "Live since", value: build.rolled_out_date ? format(new Date(build.rolled_out_date), "d MMM yyyy") : "Not yet" },
    { label: "Saves", value: `${round1(week)} h/wk · ${round1(week * WEEKS_PER_MONTH)} h/mo` },
    { label: "Billing", value: BILLING_LABEL[build.billing_model] + (build.fee_amount ? ` · ${money(Number(build.fee_amount), build.fee_currency)}` : "") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-head text-[22px] font-medium tracking-[-0.02em]">{build.title}</h2>
          <div className="mt-[6px] flex flex-wrap gap-[5px]">
            <Pill variant={statusTone(build.status)}>{build.status.replace("_", " ")}</Pill>
            <Pill variant="info">{kindLabel(build.stream)}</Pill>
            {build.replaced && <Pill>replaced {build.replaced}</Pill>}
          </div>
        </div>
        <div className="flex shrink-0 gap-[6px]">
          <ButtonV2 size="sm" variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</ButtonV2>
          <ButtonV2 size="sm" variant="ghost" className="text-[var(--bad)]" onClick={() => { if (confirm(`Delete "${build.title}" and its hours and log?`)) remove.mutate(); }}>Delete</ButtonV2>
        </div>
      </div>
      <FactsStrip facts={facts} />

      <Panel title="The build">
        <div className="grid gap-4 pt-3 md:grid-cols-2">
          <Field label="Name"><input className="dc-input" value={form.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
          <Field label="Replaced"><input className="dc-input" value={form.replaced} onChange={(e) => patch({ replaced: e.target.value })} placeholder="Calendly, Typeform, Arrows, a manual process…" /></Field>
          <Field label="Client"><select className="dc-select" value={form.client} onChange={(e) => patch({ client: e.target.value as BuildClient })}>{(Object.keys(CLIENT_LABEL) as BuildClient[]).map((c) => <option key={c} value={c}>{CLIENT_LABEL[c]}</option>)}</select></Field>
          <Field label="Kind"><select className="dc-select" value={form.stream} onChange={(e) => patch({ stream: e.target.value })}>{KIND_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
          <Field label="Status"><select className="dc-select" value={form.status} onChange={(e) => patch({ status: e.target.value })}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></Field>
          <Field label="First live"><input type="date" className="dc-input" value={form.rolled_out_date} onChange={(e) => patch({ rolled_out_date: e.target.value })} /></Field>
          <Field label="Owner on their side"><input className="dc-input" value={form.owner} onChange={(e) => patch({ owner: e.target.value })} placeholder="Who uses it day to day" /></Field>
          <div className="md:col-span-2"><Field label="Notes"><textarea className="dc-textarea" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} /></Field></div>
        </div>
      </Panel>

      <Panel title="Billing" meta={build.client === "vexon" ? "Meridian: hours saved × $10 an hour, plus any tool fee" : "Northgate Recruitment: no fixed terms, enter what they pay for it"}>
        <div className="grid gap-4 pt-3 md:grid-cols-4">
          <Field label="Model"><select className="dc-select" value={form.billing_model} onChange={(e) => patch({ billing_model: e.target.value as BillingModel })}>{(Object.keys(BILLING_LABEL) as BillingModel[]).map((m) => <option key={m} value={m}>{BILLING_LABEL[m]}</option>)}</select></Field>
          <Field label="Fee"><input type="number" step="0.01" className="dc-input" value={form.fee_amount} onChange={(e) => patch({ fee_amount: e.target.value })} placeholder="0.00" /></Field>
          <Field label="Currency"><select className="dc-select" value={form.fee_currency} onChange={(e) => patch({ fee_currency: e.target.value })}><option value="USD">USD</option><option value="GBP">GBP</option></select></Field>
          <Field label="Charged in"><input type="month" className="dc-input" value={form.fee_month} onChange={(e) => patch({ fee_month: e.target.value })} /></Field>
        </div>
      </Panel>

      <HoursPanel build={build} hours={hours} roles={roles} onChanged={onChanged} />

      <Panel title="Log" meta="What happened, when" aside={<Pill>{notes.length}</Pill>}>
        <div className="flex gap-[6px] pt-3">
          <input className="dc-input flex-1" placeholder="Shipped the per-event horizon fix…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote.mutate(); }} />
          <ButtonV2 size="sm" variant="primary" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add</ButtonV2>
        </div>
        {notes.length > 0 && (
          <RowList columns="120px 1fr" className="mt-3">
            {notes.map((n) => (
              <Row key={n.id} className="items-start">
                <RowNum className="text-[var(--dim)]">{format(new Date(n.created_at), "d MMM yyyy")}</RowNum>
                <RowName primary={<span className="font-normal">{n.body}</span>} secondary={n.author_name ?? undefined} />
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
      <p className="font-mono text-[10px] text-[var(--dim)]">id {build.id.slice(0, 8)} · updated {formatDistanceToNow(new Date(build.updated_at), { addSuffix: true })}</p>
    </div>
  );
}

function toForm(b: BuildRow) {
  return {
    title: b.title, description: b.description ?? "", client: b.client, stream: b.stream, status: b.status,
    replaced: b.replaced ?? "", owner: b.owner ?? "", rolled_out_date: b.rolled_out_date ?? "",
    billing_model: b.billing_model, fee_amount: b.fee_amount == null ? "" : String(b.fee_amount),
    fee_currency: b.fee_currency ?? "USD", fee_month: b.fee_month ? b.fee_month.slice(0, 7) : "",
  };
}

/* ----------------------------- hours per role ----------------------------- */

function HoursPanel({ build, hours, roles, onChanged }: { build: BuildRow; hours: HoursRow[]; roles: RoleRow[]; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Partial<HoursRow>>>({});
  const upsert = useMutation({
    mutationFn: async (row: Partial<HoursRow> & { id?: string }) => {
      const payload = {
        project_id: build.id, role_id: row.role_id || null, role_label: row.role_label || roles.find((r) => r.id === row.role_id)?.name || null,
        people_count: Number(row.people_count) || 1,
        baseline_hours_week: row.baseline_hours_week == null ? null : Number(row.baseline_hours_week),
        new_hours_week: row.new_hours_week == null ? null : Number(row.new_hours_week),
        reported_hours_week: row.reported_hours_week == null ? null : Number(row.reported_hours_week),
        reported_by: row.reported_by || null, reported_at: row.reported_at || null, use_reported: !!row.use_reported,
      };
      const { error } = row.id
        ? await sb.from("dev_project_hours").update(payload).eq("id", row.id)
        : await sb.from("dev_project_hours").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { setDrafts({}); onChanged(); toast.success("Hours saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb.from("dev_project_hours").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });
  const [adding, setAdding] = useState(false);
  const [draftNew, setDraftNew] = useState<Partial<HoursRow>>({ people_count: 1, use_reported: false });

  const edit = (h: HoursRow, p: Partial<HoursRow>) => setDrafts((d) => ({ ...d, [h.id]: { ...(d[h.id] ?? {}), ...p } }));
  const view = (h: HoursRow): HoursRow => ({ ...h, ...(drafts[h.id] ?? {}) });

  const rowEditor = (h: Partial<HoursRow>, set: (p: Partial<HoursRow>) => void) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      <Field label="Role"><select className="dc-select" value={h.role_id ?? ""} onChange={(e) => set({ role_id: e.target.value || null, role_label: roles.find((r) => r.id === e.target.value)?.name ?? null })}><option value="">—</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label="People"><input type="number" min={1} className="dc-input" value={h.people_count ?? 1} onChange={(e) => set({ people_count: Number(e.target.value) })} /></Field>
      <Field label="Before h/wk"><input type="number" step="0.1" className="dc-input" value={h.baseline_hours_week ?? ""} onChange={(e) => set({ baseline_hours_week: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="After h/wk"><input type="number" step="0.1" className="dc-input" value={h.new_hours_week ?? ""} onChange={(e) => set({ new_hours_week: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="They report h/wk"><input type="number" step="0.1" className="dc-input" value={h.reported_hours_week ?? ""} onChange={(e) => set({ reported_hours_week: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <Field label="Reported by"><input className="dc-input" value={h.reported_by ?? ""} onChange={(e) => set({ reported_by: e.target.value })} /></Field>
      <label className="col-span-2 flex items-center gap-2 text-[12px] text-[var(--dim)] md:col-span-3"><input type="checkbox" checked={!!h.use_reported} onChange={(e) => set({ use_reported: e.target.checked })} /> Use their reported figure for totals</label>
      <Field label="Interview date"><input type="date" className="dc-input" value={h.reported_at ?? ""} onChange={(e) => set({ reported_at: e.target.value || null })} /></Field>
    </div>
  );

  const total = hours.reduce((s, h) => s + savedPerWeek(view(h)), 0);
  return (
    <Panel title="Hours saved" meta="One line per role. Before and after come from the baseline interview; their own figure can override it." aside={<Pill variant={total > 0 ? "ok" : "default"}>{round1(total)} h/wk</Pill>}>
      <div className="space-y-5 pt-3">
        {hours.length === 0 && !adding && <p className="text-[12px] text-[var(--dim)]">No roles yet. Add the first one.</p>}
        {hours.map((h) => {
          const v = view(h);
          const changed = !!drafts[h.id];
          return (
            <div key={h.id} className="rounded-[8px] bg-[var(--surf2)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{v.role_label || roles.find((r) => r.id === v.role_id)?.name || "Role"} <span className="font-mono text-[11px] font-normal text-[var(--dim)]">· saves {round1(savedPerWeek(v))} h/wk</span></span>
                <div className="flex gap-[5px]">
                  {changed && <ButtonV2 size="sm" variant="primary" onClick={() => upsert.mutate(v)}>Save</ButtonV2>}
                  <ButtonV2 size="sm" variant="ghost" className="text-[var(--bad)]" onClick={() => { if (confirm("Remove this role line?")) remove.mutate(h.id); }}>Remove</ButtonV2>
                </div>
              </div>
              {rowEditor(v, (p) => edit(h, p))}
            </div>
          );
        })}
        {adding ? (
          <div className="rounded-[8px] bg-[var(--surf2)] p-3">
            {rowEditor(draftNew, (p) => setDraftNew((d) => ({ ...d, ...p })))}
            <div className="mt-3 flex gap-[5px]">
              <ButtonV2 size="sm" variant="primary" onClick={() => { upsert.mutate(draftNew); setAdding(false); setDraftNew({ people_count: 1, use_reported: false }); }}>Add role</ButtonV2>
              <ButtonV2 size="sm" onClick={() => setAdding(false)}>Cancel</ButtonV2>
            </div>
          </div>
        ) : (
          <ButtonV2 size="sm" onClick={() => setAdding(true)}>Add a role</ButtonV2>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="dc-label">{label}</span>
      {children}
    </label>
  );
}
