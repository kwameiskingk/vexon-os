import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Layers, Pencil, Plus, SearchCheck, Trash2, TrendingUp, User } from "lucide-react";
import { PaceCurveEditor } from "@/components/rag/PaceCurveEditor";
import {
  ROLE_METRIC_SETS,
  resolveTargetsForRole,
  type GenericResolvedTarget,
  type TargetPeriod,
} from "@/lib/targets/resolveTargets";
import { upsertIndividualTargets } from "@/lib/targets/individualTargets";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

/**
 * Dev Center Targets module — the cross-role editing surface for the target
 * tables (role_target_defaults / individual_targets / pace_curves) the RAG
 * and the upcoming review engines resolve from. Nadia's setter-profile
 * Targets tab remains the setter-scoped consumer; both write the same
 * tables, so they cannot drift.
 *
 * Semantics surfaced here, not invented here:
 * - Explicit 0 = deliberate "no target" (resolver zero rule), never a blank.
 * - individual_targets rows exist only when a human set them — no backfill.
 * - role_target_defaults provenance: updated_by NULL = migration seed
 *   ("SEEDED" badge, placeholder pending confirmation); set = human-saved
 *   ("CONFIRMED"). A proxy, not a dedicated column — good enough for dev.
 */

/** Roles the performance/targets system recognises today. */
const KNOWN_ROLES = ["setter", "account_executive", "sdr_manager", "csm", "hr"] as const;
const KNOWN_DEPARTMENTS = ["fulfilment", "acquisition"];
const PERIODS: TargetPeriod[] = ["day", "week", "month"];

const metricSuggestions = (role: string): readonly string[] =>
  role in ROLE_METRIC_SETS ? ROLE_METRIC_SETS[role as keyof typeof ROLE_METRIC_SETS] : [];

const todayKey = () => new Date().toISOString().slice(0, 10);

interface DefaultRow {
  id: string;
  role: string;
  department: string;
  metric: string;
  period: string;
  target_value: number;
  updated_by: string | null;
  updated_at: string;
}

interface IndividualRowFull {
  id: string;
  subject_profile_id: string;
  role: string;
  metric: string;
  period: string;
  target_value: number;
  effective_from: string;
  updated_by: string;
}

interface SubjectOption {
  id: string;
  label: string;
  sub: string;
}

/** Value pill that keeps explicit-zero legible everywhere it appears. */
function ValueCell({ value }: { value: number }) {
  if (Number(value) === 0) {
    return <span className="dc-pill dc-pill-warn">NO TARGET (explicit 0)</span>;
  }
  return <span className="dc-mono text-sm text-[var(--dc-text)]">{Number(value)}</span>;
}

function SeededBadge({ updatedBy }: { updatedBy: string | null }) {
  return updatedBy ? (
    <span className="dc-pill dc-pill-info">CONFIRMED</span>
  ) : (
    <span className="dc-pill dc-pill-warn">SEEDED</span>
  );
}

const ZERO_HINT =
  "0 saves as a deliberate “no target” for this metric — the resolver will not fall through to a lower layer.";

// ── Section 1: role defaults ────────────────────────────────────────────────

function RoleDefaultsSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({
    role: "setter",
    department: "fulfilment",
    metric: "",
    period: "day" as TargetPeriod,
    value: "",
  });
  const [editing, setEditing] = useState<{ id: string; value: string; period: TargetPeriod } | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["dev-role-target-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_target_defaults")
        .select("*")
        .order("role")
        .order("department")
        .order("metric");
      if (error) throw error;
      return (data as unknown as DefaultRow[]) ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dev-role-target-defaults"] });
    qc.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const metric = form.metric.trim();
      if (!metric) throw new Error("Metric is required");
      const value = Number(form.value);
      if (form.value.trim() === "" || Number.isNaN(value) || value < 0) {
        throw new Error("Value must be a number ≥ 0");
      }
      const { error } = await supabase.from("role_target_defaults").insert({
        role: form.role,
        department: form.department.trim(),
        metric,
        period: form.period,
        target_value: value,
        updated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setForm((f) => ({ ...f, metric: "", value: "" }));
      toast.success("Role default created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, value, period }: { id: string; value: number; period: TargetPeriod }) => {
      const { error } = await supabase
        .from("role_target_defaults")
        .update({ target_value: value, period, updated_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Role default updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("role_target_defaults").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Role default deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestions = metricSuggestions(form.role);

  return (
    <div className="space-y-4">
      <div className="dc-surface p-4">
        <p className="dc-label mb-3">New role default</p>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-2 items-center">
          <select
            className="dc-input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value, metric: "" })}
          >
            {KNOWN_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            className="dc-input"
            list="dc-dept-suggestions"
            placeholder="department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <input
            className="dc-input"
            list="dc-metric-suggestions"
            placeholder="metric"
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: e.target.value })}
          />
          <datalist id="dc-metric-suggestions">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <select
            className="dc-input"
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value as TargetPeriod })}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            className="dc-input w-24"
            type="number"
            min={0}
            placeholder="value"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <button className="dc-btn dc-btn-primary" onClick={() => create.mutate()}>
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {Number(form.value) === 0 && form.value.trim() !== "" && (
          <p className="dc-mono text-[11px] mt-2 text-[var(--dc-text-dim)]">{ZERO_HINT}</p>
        )}
      </div>

      <div className="dc-surface">
        {rows.length === 0 && (
          <p className="dc-mono text-xs p-6 text-[var(--dc-text-dim)] text-center">
            No role defaults. Add one above.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto_auto] gap-2 items-center p-3 border-b border-[var(--dc-border)]/60 last:border-0"
          >
            <span className="dc-mono text-sm text-[var(--dc-cyan)]">{r.role}</span>
            <span className="dc-mono text-xs text-[var(--dc-text-dim)]">{r.department || "—"}</span>
            <span className="dc-mono text-sm text-[var(--dc-text)]">{r.metric}</span>
            {editing?.id === r.id ? (
              <>
                <select
                  className="dc-input"
                  value={editing.period}
                  onChange={(e) => setEditing({ ...editing, period: e.target.value as TargetPeriod })}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  className="dc-input w-24"
                  type="number"
                  min={0}
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                />
                <button
                  className="dc-btn dc-btn-primary"
                  onClick={() => {
                    const v = Number(editing.value);
                    if (editing.value.trim() === "" || Number.isNaN(v) || v < 0) {
                      toast.error("Value must be a number ≥ 0");
                      return;
                    }
                    update.mutate({ id: r.id, value: v, period: editing.period });
                  }}
                >
                  Save
                </button>
                <button className="dc-btn" onClick={() => setEditing(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span className="dc-pill">{r.period}</span>
                <ValueCell value={r.target_value} />
                <SeededBadge updatedBy={r.updated_by} />
                <div className="flex gap-2 justify-end">
                  <button
                    className="dc-btn"
                    onClick={() =>
                      setEditing({ id: r.id, value: String(r.target_value), period: r.period as TargetPeriod })
                    }
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    className="dc-btn dc-btn-danger"
                    onClick={() => {
                      if (window.confirm(`Delete ${r.role}/${r.department} ${r.metric} (${r.period}) default?`)) {
                        remove.mutate(r.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {editing && Number(editing.value) === 0 && editing.value.trim() !== "" && (
          <p className="dc-mono text-[11px] p-3 text-[var(--dc-text-dim)]">{ZERO_HINT}</p>
        )}
      </div>
    </div>
  );
}

// ── Subject picking (shared by overrides + inspector) ───────────────────────

function useSubjectOptions(role: string) {
  return useQuery({
    queryKey: ["dev-target-subjects", role],
    queryFn: async (): Promise<SubjectOption[]> => {
      if (role === "setter") {
        // Setter subjects key on setters_profiles.id (the RAG convention).
        const { data, error } = await supabase
          .from("setters_profiles")
          .select("id, full_name, department, active, is_test_account")
          .eq("active", true)
          .eq("is_test_account", false)
          .neq("department", "sales") // AE telemetry rows are not setter subjects
          .order("full_name");
        if (error) throw error;
        return (data ?? []).map((s) => ({
          id: s.id,
          label: s.full_name,
          sub: s.department ?? "",
        }));
      }
      // Other roles key on profiles.id (per the individual_targets convention).
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role as "setter");
      if (rolesError) throw rolesError;
      // Target-setting pickers only list current staff.
      const offboarded = await fetchOffboardedUserIds();
      const userIds = (roleRows ?? []).map((r) => r.user_id).filter((id) => !offboarded.has(id));
      if (userIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
        .order("full_name");
      if (profilesError) throw profilesError;
      return (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name, sub: p.email }));
    },
  });
}

// ── Section 2: individual overrides ─────────────────────────────────────────

function IndividualOverridesSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [role, setRole] = useState<string>("setter");
  const [subjectId, setSubjectId] = useState<string>("");
  const [form, setForm] = useState({ metric: "", period: "day" as TargetPeriod, value: "" });

  const { data: subjects = [] } = useSubjectOptions(role);

  const { data: rows = [] } = useQuery({
    queryKey: ["dev-individual-targets", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("individual_targets")
        .select("*")
        .eq("subject_profile_id", subjectId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data as unknown as IndividualRowFull[]) ?? [];
    },
  });

  // Latest row per (metric, period) is what the resolver can see; older rows
  // are effectivity history. Split so history is visible but not editable.
  const { latest, history } = useMemo(() => {
    const seen = new Set<string>();
    const latestRows: IndividualRowFull[] = [];
    const historyRows: IndividualRowFull[] = [];
    for (const r of rows) {
      const key = `${r.metric}|${r.period}`;
      if (seen.has(key)) historyRows.push(r);
      else {
        seen.add(key);
        latestRows.push(r);
      }
    }
    return { latest: latestRows, history: historyRows };
  }, [rows]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dev-individual-targets", subjectId] });
    qc.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!subjectId) throw new Error("Pick a subject first");
      if (!user?.id) throw new Error("No authenticated user");
      const metric = form.metric.trim();
      if (!metric) throw new Error("Metric is required");
      const value = Number(form.value);
      if (form.value.trim() === "" || Number.isNaN(value) || value < 0) {
        throw new Error("Value must be a number ≥ 0");
      }
      await upsertIndividualTargets<string>(
        subjectId,
        [{ metric, period: form.period, value }],
        user.id,
        role,
      );
    },
    onSuccess: () => {
      invalidate();
      setForm((f) => ({ ...f, metric: "", value: "" }));
      toast.success("Override saved (effective today)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("individual_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Override deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestions = metricSuggestions(role);
  const rowLine = (r: IndividualRowFull, dim = false) => (
    <div
      key={r.id}
      className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center p-3 border-b border-[var(--dc-border)]/60 last:border-0 ${dim ? "opacity-50" : ""}`}
    >
      <span className="dc-mono text-sm text-[var(--dc-text)]">{r.metric}</span>
      <span className="dc-pill">{r.period}</span>
      <ValueCell value={r.target_value} />
      <span className="dc-mono text-[11px] text-[var(--dc-text-dim)]">from {r.effective_from}</span>
      <button
        className="dc-btn dc-btn-danger"
        onClick={() => {
          if (window.confirm(`Delete ${r.metric} (${r.period}) override from ${r.effective_from}?`)) {
            remove.mutate(r.id);
          }
        }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="dc-surface p-4">
        <p className="dc-label mb-3">Subject</p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <select
            className="dc-input"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setSubjectId("");
            }}
          >
            {KNOWN_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select className="dc-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{subjects.length === 0 ? `no ${role} subjects found` : "pick a subject…"}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}{s.sub ? ` · ${s.sub}` : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="dc-mono text-[11px] mt-2 text-[var(--dc-text-dim)]">
          Setters key on setters_profiles.id; other roles on profiles.id. Rows exist only when a human
          sets them — nothing is ever backfilled.
        </p>
      </div>

      {subjectId && (
        <>
          <div className="dc-surface p-4">
            <p className="dc-label mb-3">New / replace override (effective today)</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
              <input
                className="dc-input"
                list="dc-ind-metric-suggestions"
                placeholder="metric"
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
              />
              <datalist id="dc-ind-metric-suggestions">
                {suggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <select
                className="dc-input"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value as TargetPeriod })}
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                className="dc-input w-24"
                type="number"
                min={0}
                placeholder="value"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
              <button className="dc-btn dc-btn-primary" onClick={() => save.mutate()}>
                <Plus className="h-3 w-3" /> Save
              </button>
            </div>
            {Number(form.value) === 0 && form.value.trim() !== "" && (
              <p className="dc-mono text-[11px] mt-2 text-[var(--dc-text-dim)]">{ZERO_HINT}</p>
            )}
          </div>

          <div className="dc-surface">
            <p className="dc-label p-3 pb-0">Current (latest per metric/period)</p>
            {latest.length === 0 && (
              <p className="dc-mono text-xs p-6 text-[var(--dc-text-dim)] text-center">
                No individual overrides — this subject resolves from role defaults.
              </p>
            )}
            {latest.map((r) => rowLine(r))}
            {history.length > 0 && (
              <>
                <p className="dc-label p-3 pb-0">Superseded history</p>
                {history.map((r) => rowLine(r, true))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Section 3: pace curves ──────────────────────────────────────────────────

function PaceCurvesSection() {
  const [department, setDepartment] = useState("fulfilment");
  const [draft, setDraft] = useState("fulfilment");

  const { data: existing = [] } = useQuery({
    queryKey: ["dev-pace-curve-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pace_curves").select("department, period");
      if (error) throw error;
      return data ?? [];
    },
  });

  const departments = useMemo(() => {
    const set = new Set<string>(KNOWN_DEPARTMENTS);
    for (const row of existing) set.add(row.department);
    return [...set].sort();
  }, [existing]);

  return (
    <div className="space-y-4">
      <div className="dc-surface p-4">
        <p className="dc-label mb-3">Department</p>
        <div className="flex gap-2 items-center flex-wrap">
          {departments.map((d) => (
            <button
              key={d}
              className={`dc-btn ${department === d ? "dc-btn-primary" : ""}`}
              onClick={() => {
                setDepartment(d);
                setDraft(d);
              }}
            >
              {d}
            </button>
          ))}
          <input
            className="dc-input w-44"
            placeholder="other department…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) setDepartment(draft.trim());
            }}
          />
          <button className="dc-btn" onClick={() => draft.trim() && setDepartment(draft.trim())}>
            Load
          </button>
        </div>
        <p className="dc-mono text-[11px] mt-2 text-[var(--dc-text-dim)]">
          One weekly SHAPE per department (weights sum to 100). Saving creates the row if the
          department has none yet.
        </p>
      </div>
      <PaceCurveEditor key={department} department={department} />
    </div>
  );
}

// ── Section 4: resolution inspector ─────────────────────────────────────────

function ResolutionInspectorSection() {
  const [role, setRole] = useState<string>("setter");
  const [department, setDepartment] = useState("fulfilment");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(todayKey());
  const [extraMetric, setExtraMetric] = useState("");
  const [extraMetrics, setExtraMetrics] = useState<string[]>([]);

  const { data: subjects = [] } = useSubjectOptions(role);

  const metrics = useMemo(() => {
    const base = [...metricSuggestions(role)];
    for (const m of extraMetrics) if (!base.includes(m)) base.push(m);
    return base;
  }, [role, extraMetrics]);

  const { data: resolved, isFetching } = useQuery({
    queryKey: ["dev-target-resolution", role, department, subjectId, date, metrics],
    enabled: !!subjectId && metrics.length > 0,
    queryFn: async () => {
      const map = await resolveTargetsForRole([subjectId], role, department, date, metrics);
      return map.get(subjectId) ?? {};
    },
  });

  const sourceLabel = (t: GenericResolvedTarget): { text: string; cls: string } => {
    if (t.kind === "target") {
      if (t.source === "individual") return { text: "INDIVIDUAL", cls: "dc-pill-info" };
      if (t.source === "pip") return { text: "PIP", cls: "dc-pill-warn" };
      return { text: "ROLE DEFAULT", cls: "dc-pill" };
    }
    if (t.reason === "explicit_zero") {
      return { text: `NO TARGET — explicit 0 (${t.source ?? "?"})`, cls: "dc-pill-warn" };
    }
    return { text: "NO TARGET — unset", cls: "dc-pill" };
  };

  return (
    <div className="space-y-4">
      <div className="dc-surface p-4">
        <p className="dc-label mb-3">What does the resolver actually return?</p>
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
          <select
            className="dc-input"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setSubjectId("");
              setExtraMetrics([]);
            }}
          >
            {KNOWN_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select className="dc-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{subjects.length === 0 ? `no ${role} subjects found` : "pick a subject…"}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}{s.sub ? ` · ${s.sub}` : ""}
              </option>
            ))}
          </select>
          <input
            className="dc-input"
            list="dc-dept-suggestions"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <input className="dc-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center mt-2">
          <input
            className="dc-input w-56"
            placeholder="add ad-hoc metric…"
            value={extraMetric}
            onChange={(e) => setExtraMetric(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && extraMetric.trim()) {
                setExtraMetrics((xs) => [...xs, extraMetric.trim()]);
                setExtraMetric("");
              }
            }}
          />
          <button
            className="dc-btn"
            onClick={() => {
              if (extraMetric.trim()) {
                setExtraMetrics((xs) => [...xs, extraMetric.trim()]);
                setExtraMetric("");
              }
            }}
          >
            <Plus className="h-3 w-3" /> Metric
          </button>
        </div>
      </div>

      {subjectId && (
        <div className="dc-surface">
          {isFetching && (
            <p className="dc-mono text-xs p-6 text-[var(--dc-text-dim)] text-center">Resolving…</p>
          )}
          {!isFetching &&
            metrics.map((m) => {
              const t = resolved?.[m];
              if (!t) return null;
              const src = sourceLabel(t);
              return (
                <div
                  key={m}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center p-3 border-b border-[var(--dc-border)]/60 last:border-0"
                >
                  <span className="dc-mono text-sm text-[var(--dc-text)]">{m}</span>
                  {t.kind === "target" ? (
                    <span className="dc-mono text-sm text-[var(--dc-cyan)]">
                      {t.value} / {t.period}
                    </span>
                  ) : (
                    <span className="dc-mono text-sm text-[var(--dc-text-dim)]">—</span>
                  )}
                  <span className={`dc-pill ${src.cls}`}>{src.text}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── Module shell ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "defaults", label: "Role defaults", icon: Layers, comp: RoleDefaultsSection },
  { id: "individual", label: "Individual overrides", icon: User, comp: IndividualOverridesSection },
  { id: "curves", label: "Pace curves", icon: TrendingUp, comp: PaceCurvesSection },
  { id: "inspector", label: "Resolution inspector", icon: SearchCheck, comp: ResolutionInspectorSection },
];

export function TargetsModule() {
  const [active, setActive] = useState("defaults");
  const Section = SECTIONS.find((s) => s.id === active)?.comp ?? RoleDefaultsSection;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`dc-btn ${active === s.id ? "dc-btn-primary" : ""}`}
            onClick={() => setActive(s.id)}
          >
            <s.icon className="h-3 w-3" />
            {s.label}
          </button>
        ))}
      </div>
      <datalist id="dc-dept-suggestions">
        {KNOWN_DEPARTMENTS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <Section />
    </div>
  );
}
