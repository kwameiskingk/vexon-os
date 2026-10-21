import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Plus, Download, Pencil, X, Save, Info } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";


type Mandate = {
  id: string;
  title: string;
  description: string | null;
  target_metric: string | null;
  incentive_model: string | null;
  status: "active" | "paused" | "archived";
};
type Role = { id: string; name: string; main_goal: string | null; highest_roi_task: string | null };
type Target = {
  id: string;
  role_id: string;
  task_name: string;
  build_type: "dashboard" | "workflow" | "agent" | "undecided";
  status: "identified" | "building" | "testing" | "rolled_out";
  linked_project_id: string | null;
};
type Project = {
  id: string;
  title: string;
  status: string;
  mandate_id: string | null;
  role_id: string | null;
  baseline_hours_week: number | null;
  new_hours_week: number | null;
  reported_hours_week: number | null;
  reported_by: string | null;
  use_reported_for_totals: boolean | null;
  owner: string | null;
  rolled_out_date: string | null;
};

type StackTool = { id: string; name: string; layer: string; note: string | null; status: "active" | "planned" };

const sb: any = supabase;

const BUILD_COLORS: Record<string, string> = {
  dashboard: "#9fb3c8",
  workflow: "#7a7a80",
  agent: "#F59E0B",
  undecided: "#7C849A",
};

const STATUS_LABEL: Record<string, string> = {
  identified: "IDENTIFIED",
  building: "BUILDING",
  testing: "TESTING",
  rolled_out: "ROLLED OUT",
};

// Stable role ordering for the Map row
const ROLE_ORDER = [
  "HR",
  "SDR Manager",
  "CSM",
  "AE",
  "Acquisition Setter",
  "Fulfilment Setter",
  "Developer",
];

export function MandateModule() {
  const [tab, setTab] = useState<"overview" | "map" | "reporting">("overview");
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stack, setStack] = useState<StackTool[]>([]);
  const [selectedMandateId, setSelectedMandateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);


  const reload = useCallback(async () => {
    setLoading(true);
    const [m, r, t, p, s] = await Promise.all([
      sb.from("dev_mandates").select("*").order("created_at", { ascending: true }),
      sb.from("dev_roles").select("*").order("name"),
      sb.from("dev_role_targets").select("*").order("task_name"),
      sb.from("dev_projects").select("id,title,status,mandate_id,role_id,baseline_hours_week,new_hours_week,reported_hours_week,reported_by,use_reported_for_totals,owner,rolled_out_date"),
      sb.from("dev_stack_tools").select("*").order("layer"),
    ]);
    if (m.data) setMandates(m.data);
    if (r.data) setRoles(r.data);
    if (t.data) setTargets(t.data);
    if (p.data) setProjects(p.data);
    if (s.data) setStack(s.data);
    if (!selectedMandateId && m.data?.[0]) setSelectedMandateId(m.data[0].id);
    setLoading(false);
  }, [selectedMandateId]);

  useEffect(() => { reload(); }, []); // eslint-disable-line

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-[var(--dc-border)] pb-2">
        <div className="flex gap-2">
          {(["overview", "map", "reporting"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`dc-rail-btn !w-auto ${tab === t ? "active" : ""}`}
            >
              <span>{t}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setInfoOpen(true)}
          className="h-7 w-7 rounded-full border border-[var(--dc-border)] flex items-center justify-center text-[var(--dc-text-dim)] hover:text-[var(--dc-cyan)] hover:border-[var(--dc-cyan)] transition-colors"
          title="How the Mandate module works"
          aria-label="How the Mandate module works"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      <MandateInfoDialog open={infoOpen} onOpenChange={setInfoOpen} />


      {loading ? (
        <p className="dc-mono text-xs text-[var(--dc-text-dim)]">[ LOADING... ]</p>
      ) : tab === "overview" ? (
        <OverviewTab
          mandates={mandates}
          targets={targets}
          stack={stack}
          selectedMandateId={selectedMandateId}
          onSelect={setSelectedMandateId}
          reload={reload}
        />
      ) : tab === "map" ? (
        <MapTab
          mandate={mandates.find((m) => m.id === selectedMandateId) || null}
          roles={roles}
          targets={targets}
          projects={projects}
          mandates={mandates}
          onSelectMandate={setSelectedMandateId}
          reload={reload}
        />
      ) : (
        <ReportingTab
          mandate={mandates.find((m) => m.id === selectedMandateId) || null}
          mandates={mandates}
          roles={roles}
          projects={projects}
          onSelectMandate={setSelectedMandateId}
        />
      )}
    </div>
  );
}

/* ============================ OVERVIEW ============================ */

function OverviewTab({
  mandates, targets, stack, selectedMandateId, onSelect, reload,
}: {
  mandates: Mandate[]; targets: Target[]; stack: StackTool[];
  selectedMandateId: string | null;
  onSelect: (id: string) => void;
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const statusCounts = () => {
    const c = { identified: 0, building: 0, testing: 0, rolled_out: 0 };
    targets.forEach((t) => { c[t.status] += 1; });
    return c;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] tracking-[0.2em]">
          [ STRATEGIC MANDATES // {mandates.length} ACTIVE ]
        </p>
        <button onClick={() => setCreating(true)} className="dc-btn dc-btn-primary">
          <Plus className="h-3 w-3" /> New Mandate
        </button>
      </div>

      {creating && (
        <MandateForm
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        />
      )}

      <div className="grid gap-3">
        {mandates.map((m) => {
          const counts = statusCounts();
          const isSelected = m.id === selectedMandateId;
          return editingId === m.id ? (
            <MandateForm
              key={m.id}
              initial={m}
              onCancel={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); reload(); }}
            />
          ) : (
            <div
              key={m.id}
              className="dc-surface p-4 cursor-pointer transition-all"
              style={{
                borderColor: isSelected ? "var(--dc-cyan)" : undefined,
                boxShadow: isSelected ? "0 0 20px rgba(34,211,238,0.12)" : undefined,
              }}
              onClick={() => onSelect(m.id)}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg text-[var(--dc-text)]">{m.title}</h3>
                    <span className={`dc-pill ${m.status === "active" ? "dc-pill-ok" : "dc-pill-dim"}`}>
                      {m.status}
                    </span>
                  </div>
                  {m.description && (
                    <p className="text-sm text-[var(--dc-text-dim)] mb-3">{m.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="dc-label">Target metric</p>
                      <p className="dc-mono text-[var(--dc-cyan)]">{m.target_metric || "—"}</p>
                    </div>
                    <div>
                      <p className="dc-label">Incentive model</p>
                      <p className="dc-mono text-[var(--dc-violet)]">{m.incentive_model || "—"}</p>
                    </div>
                  </div>
                </div>
                <button
                  className="dc-btn"
                  onClick={(e) => { e.stopPropagation(); setEditingId(m.id); }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </div>

              <div className="dc-divider" />

              <div className="grid grid-cols-4 gap-3">
                {(["identified", "building", "testing", "rolled_out"] as const).map((s) => (
                  <div key={s} className="dc-surface-2 p-3">
                    <p className="dc-label">{STATUS_LABEL[s]}</p>
                    <p className="dc-metric-num text-xl">{counts[s]}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <StackPanel stack={stack} reload={reload} />
    </div>
  );
}

function MandateForm({
  initial, onCancel, onSaved,
}: {
  initial?: Mandate;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    target_metric: initial?.target_metric || "",
    incentive_model: initial?.incentive_model || "",
    status: initial?.status || "active",
  });

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    const op = initial
      ? sb.from("dev_mandates").update(form).eq("id", initial.id)
      : sb.from("dev_mandates").insert(form);
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Mandate updated" : "Mandate created");
    onSaved();
  };

  return (
    <div className="dc-surface p-4 space-y-3" style={{ borderColor: "var(--dc-violet)" }}>
      <div>
        <label className="dc-label">Title</label>
        <input className="dc-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <label className="dc-label">Description</label>
        <textarea className="dc-textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="dc-label">Target metric</label>
          <input className="dc-input" value={form.target_metric} onChange={(e) => setForm({ ...form, target_metric: e.target.value })} />
        </div>
        <div>
          <label className="dc-label">Incentive model</label>
          <input className="dc-input" value={form.incentive_model} onChange={(e) => setForm({ ...form, incentive_model: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="dc-label">Status</label>
        <select className="dc-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button className="dc-btn" onClick={onCancel}><X className="h-3 w-3" /> Cancel</button>
        <button className="dc-btn dc-btn-primary" onClick={save}><Save className="h-3 w-3" /> Save</button>
      </div>
    </div>
  );
}

function StackPanel({ stack, reload }: { stack: StackTool[]; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", layer: "Front-end/Dashboards", note: "", status: "active" });

  const layers = useMemo(() => {
    const map: Record<string, StackTool[]> = {};
    stack.forEach((t) => { (map[t.layer] ||= []).push(t); });
    return map;
  }, [stack]);

  const addTool = async () => {
    if (!form.name.trim()) return;
    const { error } = await sb.from("dev_stack_tools").insert(form);
    if (error) { toast.error(error.message); return; }
    setForm({ name: "", layer: "Front-end/Dashboards", note: "", status: "active" });
    setAdding(false);
    reload();
  };

  const removeTool = async (id: string) => {
    await sb.from("dev_stack_tools").delete().eq("id", id);
    reload();
  };

  return (
    <div className="dc-surface p-4">
      <div className="flex justify-between items-center mb-3">
        <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] tracking-[0.2em]">[ STACK // BUILD CONTEXT ]</p>
        <button className="dc-btn" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3" /> Tool
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          <input className="dc-input col-span-1" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="dc-input col-span-1" placeholder="layer" value={form.layer} onChange={(e) => setForm({ ...form, layer: e.target.value })} />
          <input className="dc-input col-span-2" placeholder="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <select className="dc-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">active</option><option value="planned">planned</option>
          </select>
          <button className="dc-btn dc-btn-primary col-span-5" onClick={addTool}>Add tool</button>
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(layers).map(([layer, tools]) => (
          <div key={layer}>
            <p className="dc-label mb-2">{layer}</p>
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => (
                <div
                  key={t.id}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 rounded border"
                  style={{
                    borderColor: t.status === "active" ? "var(--dc-cyan)" : "var(--dc-text-dim)",
                    background: "var(--dc-surface-2)",
                  }}
                >
                  <span className="dc-mono text-xs" style={{ color: t.status === "active" ? "var(--dc-cyan)" : "var(--dc-text-dim)" }}>
                    {t.name}
                  </span>
                  {t.note && <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">// {t.note}</span>}
                  {t.status === "planned" && <span className="dc-pill dc-pill-warn">planned</span>}
                  <button onClick={() => removeTool(t.id)} className="opacity-0 group-hover:opacity-100 text-[var(--dc-text-dim)] hover:text-[var(--dc-red)]">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ MAP ============================ */

function MapTab({
  mandate, roles, targets, projects, mandates, onSelectMandate, reload,
}: {
  mandate: Mandate | null;
  mandates: Mandate[];
  roles: Role[];
  targets: Target[];
  projects: Project[];
  onSelectMandate: (id: string) => void;
  reload: () => void;
}) {
  const [createForTarget, setCreateForTarget] = useState<Target | null>(null);

  // Order roles by ROLE_ORDER, then any extras alphabetically
  const orderedRoles = useMemo(() => {
    const byName = new Map(roles.map((r) => [r.name, r]));
    const head = ROLE_ORDER.map((n) => byName.get(n)).filter(Boolean) as Role[];
    const extras = roles.filter((r) => !ROLE_ORDER.includes(r.name));
    return [...head, ...extras];
  }, [roles]);

  const ROLE_W = 240;
  const ROLE_GAP = 60;
  const TASK_H = 84;
  const ROLE_Y = 180;
  const TASKS_START_Y = 320;

  const { nodes, edges, contentWidth } = useMemo(() => {
    if (!mandate) return { nodes: [], edges: [], contentWidth: 800 };
    const ns: Node[] = [];
    const es: Edge[] = [];

    const totalWidth = orderedRoles.length * ROLE_W + (orderedRoles.length - 1) * ROLE_GAP;
    const startX = 0;
    const centerX = startX + totalWidth / 2 - ROLE_W / 2;

    // Mandate root, centered above the row
    ns.push({
      id: "mandate",
      position: { x: centerX, y: 20 },
      data: { label: mandate.title, sub: mandate.target_metric || "Strategic mandate", tone: "mandate" },
      type: "dc",
      draggable: false,
    });

    orderedRoles.forEach((r, ri) => {
      const rx = startX + ri * (ROLE_W + ROLE_GAP);
      const roleNodeId = `role-${r.id}`;
      ns.push({
        id: roleNodeId,
        position: { x: rx, y: ROLE_Y },
        data: { label: r.name, sub: r.highest_roi_task || "—", tone: "role" },
        type: "dc",
        draggable: false,
      });
      es.push({
        id: `e-m-${r.id}`,
        source: "mandate",
        target: roleNodeId,
        style: { stroke: "#9fb3c8", strokeOpacity: 0.5 },
      });

      const tList = targets.filter((t) => t.role_id === r.id);
      tList.forEach((t, ti) => {
        const tNodeId = `tgt-${t.id}`;
        ns.push({
          id: tNodeId,
          position: { x: rx, y: TASKS_START_Y + ti * TASK_H },
          data: {
            label: t.task_name,
            sub: t.linked_project_id ? "→ click to open project" : "click to create project",
            tone: "target",
            color: BUILD_COLORS[t.build_type],
            status: t.status,
            target: t,
            roleName: r.name,
            mandateId: mandate.id,
          },
          type: "dc",
          draggable: false,
        });
        es.push({
          id: `e-${roleNodeId}-${t.id}`,
          source: ti === 0 ? roleNodeId : `tgt-${tList[ti - 1].id}`,
          target: tNodeId,
          style: { stroke: BUILD_COLORS[t.build_type], strokeOpacity: 0.45 },
        });
      });
    });

    return { nodes: ns, edges: es, contentWidth: Math.max(totalWidth + 80, 800) };
  }, [mandate, orderedRoles, targets]);

  const handleNodeClick = (_e: any, node: Node) => {
    const data: any = node.data;
    if (data?.tone !== "target") return;
    const t: Target = data.target;
    if (t.linked_project_id) {
      window.dispatchEvent(new CustomEvent("dev-center:open", { detail: { module: "projects", projectId: t.linked_project_id } }));
    } else {
      setCreateForTarget(t);
    }
  };

  if (!mandate) {
    return <p className="dc-mono text-xs text-[var(--dc-text-dim)]">No mandate selected.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="dc-label !mb-0">Mandate:</span>
        {mandates.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelectMandate(m.id)}
            className={`dc-btn ${m.id === mandate.id ? "dc-btn-primary" : ""}`}
          >
            {m.title}
          </button>
        ))}
      </div>

      <div className="dc-surface" style={{ height: 680, padding: 0, overflow: "hidden" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ dc: DcNode }}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--dc-bg)", width: "100%", height: "100%" }}
        >
          <Background color="#1a1d28" gap={20} />
          <Controls
            showInteractive={false}
            style={{ background: "var(--dc-surface-2)", border: "1px solid var(--dc-border)" }}
          />
        </ReactFlow>
      </div>
      <p className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
        [ canvas spans ~{Math.round(contentWidth)}px · use the in-canvas controls to zoom, fit, or pan ]
      </p>

      <div className="flex flex-wrap gap-4 dc-surface p-3">
        <p className="dc-label !mb-0 mr-2">Legend:</p>
        {Object.entries(BUILD_COLORS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: v }} />
            <span className="dc-mono text-[11px] text-[var(--dc-text-dim)] uppercase">{k}</span>
          </div>
        ))}
      </div>

      {createForTarget && (
        <CreateProjectFromTarget
          target={createForTarget}
          mandateId={mandate.id}
          roleName={roles.find((r) => r.id === createForTarget.role_id)?.name || ""}
          onClose={() => setCreateForTarget(null)}
          onCreated={() => { setCreateForTarget(null); reload(); }}
        />
      )}
    </div>
  );
}

function DcNode({ data }: { data: any }) {
  const tone = data.tone as string;
  const styles: Record<string, React.CSSProperties> = {
    mandate: { background: "linear-gradient(135deg, #7a7a80, #9fb3c8)", color: "#08090C", border: "none", minWidth: 260, maxWidth: 260 },
    role: { background: "var(--dc-surface)", border: "1px solid var(--dc-cyan)", color: "var(--dc-cyan)", minWidth: 220, maxWidth: 220 },
    target: { background: "var(--dc-surface-2)", border: `1px solid ${data.color || "#7C849A"}`, color: data.color || "#e3e3e6", minWidth: 220, maxWidth: 220 },
  };
  return (
    <div
      style={{
        ...styles[tone],
        padding: "10px 14px",
        borderRadius: 6,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        textAlign: "center",
        cursor: tone === "target" ? "pointer" : "default",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "normal", wordBreak: "break-word" }}>
        {data.label}
      </div>
      {data.sub && (
        <div style={{ fontSize: 9, opacity: 0.75, marginTop: 4, whiteSpace: "normal", wordBreak: "break-word" }}>
          {data.sub}
        </div>
      )}
      {data.status && (
        <div style={{ marginTop: 6, fontSize: 8, letterSpacing: "0.1em" }}>[{STATUS_LABEL[data.status]}]</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function CreateProjectFromTarget({
  target, mandateId, roleName, onClose, onCreated,
}: {
  target: Target; mandateId: string; roleName: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState(`${target.task_name} (${roleName})`);
  const [streamGuess] = useState<"application" | "automation" | "ai">(
    target.build_type === "dashboard" ? "application" :
    target.build_type === "agent" ? "ai" : "automation"
  );
  const [baseline, setBaseline] = useState("");
  const [newH, setNewH] = useState("");

  const save = async () => {
    const { data, error } = await sb.from("dev_projects").insert({
      title,
      description: `Auto-created from mandate target: ${target.task_name}`,
      stream: streamGuess,
      status: "planned",
      priority: "medium",
      mandate_id: mandateId,
      role_id: target.role_id,
      baseline_hours_week: baseline ? Number(baseline) : null,
      new_hours_week: newH ? Number(newH) : null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await sb.from("dev_role_targets").update({ linked_project_id: data.id, status: "building" }).eq("id", target.id);
    toast.success("Project created and linked");
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="dc-surface p-5 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] tracking-[0.2em]">[ CREATE PROJECT FROM TARGET ]</p>
        <h3 className="text-lg text-[var(--dc-cyan)]">{target.task_name}</h3>
        <div>
          <label className="dc-label">Project title</label>
          <input className="dc-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dc-label">Baseline hrs/week</label>
            <input className="dc-input" type="number" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
          </div>
          <div>
            <label className="dc-label">New hrs/week</label>
            <input className="dc-input" type="number" value={newH} onChange={(e) => setNewH(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-[var(--dc-text-dim)]">
          Stream auto-set to <span className="dc-mono text-[var(--dc-violet)]">{streamGuess}</span> based on build type.
        </p>
        <div className="flex justify-end gap-2">
          <button className="dc-btn" onClick={onClose}>Cancel</button>
          <button className="dc-btn dc-btn-primary" onClick={save}>Create + link</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ REPORTING ============================ */

function ReportingTab({
  mandate, mandates, roles, projects, onSelectMandate,
}: {
  mandate: Mandate | null;
  mandates: Mandate[];
  roles: Role[];
  projects: Project[];
  onSelectMandate: (id: string) => void;
}) {
  const [month, setMonth] = useState<string>(""); // YYYY-MM

  const rolled = useMemo(() => {
    return projects.filter((p) => {
      if (!p.rolled_out_date) return false;
      if (mandate && p.mandate_id !== mandate.id) return false;
      if (month) {
        const ym = p.rolled_out_date.slice(0, 7);
        if (ym !== month) return false;
      }
      return true;
    });
  }, [projects, mandate, month]);

  const rows = useMemo(() => {
    return rolled.map((p) => {
      const role = roles.find((r) => r.id === p.role_id);
      const measured = (Number(p.baseline_hours_week) || 0) - (Number(p.new_hours_week) || 0);
      const reported = p.reported_hours_week != null ? Number(p.reported_hours_week) : null;
      const useReported = !!p.use_reported_for_totals && reported != null;
      const effective = useReported ? (reported as number) : measured;
      return {
        role: role?.name || "—",
        task: p.title,
        owner: p.owner || "—",
        baseline: Number(p.baseline_hours_week) || 0,
        new_h: Number(p.new_hours_week) || 0,
        measured,
        reported,
        reported_by: p.reported_by,
        use_reported: useReported,
        saved_week: effective,
        saved_month: effective * 4.3,
        rolled_out_date: p.rolled_out_date,

      };
    });
  }, [rolled, roles]);

  const totalWeek = rows.reduce((s, r) => s + r.saved_week, 0);
  const totalMonth = rows.reduce((s, r) => s + r.saved_month, 0);

  const byRole = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { map[r.role] = (map[r.role] || 0) + r.saved_week; });
    return Object.entries(map).map(([role, hours]) => ({ role, hours: Number(hours.toFixed(1)) }));
  }, [rows]);

  const exportCSV = () => {
    const header = ["Role", "Task", "Owner", "Baseline hrs/wk", "New hrs/wk", "Saved/wk", "Saved/mo", "Rolled out"];
    const lines = [header.join(",")].concat(
      rows.map((r) => [r.role, `"${r.task}"`, r.owner, r.baseline, r.new_h, r.saved_week.toFixed(2), r.saved_month.toFixed(2), r.rolled_out_date].join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mandate-report-${month || "all"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="dc-label !mb-0">Mandate:</span>
        <select className="dc-select w-auto" value={mandate?.id || ""} onChange={(e) => onSelectMandate(e.target.value)}>
          {mandates.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <span className="dc-label !mb-0 ml-3">Month:</span>
        <input className="dc-input w-auto" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {month && <button className="dc-btn" onClick={() => setMonth("")}>Clear</button>}
        <button className="dc-btn dc-btn-primary ml-auto" onClick={exportCSV}>
          <Download className="h-3 w-3" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="dc-surface p-4">
          <p className="dc-label">Hours saved / week</p>
          <p className="dc-metric-num" style={{ color: "var(--dc-cyan)" }}>{totalWeek.toFixed(1)}</p>
        </div>
        <div className="dc-surface p-4">
          <p className="dc-label">Hours saved / month</p>
          <p className="dc-metric-num" style={{ color: "var(--dc-violet)" }}>{totalMonth.toFixed(1)}</p>
        </div>
        <div className="dc-surface p-4">
          <p className="dc-label">Rolled-out projects</p>
          <p className="dc-metric-num">{rows.length}</p>
        </div>
      </div>

      <div className="dc-surface p-4">
        <p className="dc-label mb-3">Hours saved by role</p>
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={byRole}>
              <CartesianGrid stroke="#1a1d28" strokeDasharray="3 3" />
              <XAxis dataKey="role" stroke="#7C849A" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#7C849A" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#0E1014", border: "1px solid #9fb3c8", fontFamily: "JetBrains Mono", fontSize: 11 }} />
              <Bar dataKey="hours" fill="#9fb3c8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dc-surface p-0 overflow-hidden">
        <table className="w-full text-xs dc-mono">
          <thead>
            <tr className="border-b border-[var(--dc-border)]">
              {["Role", "Task", "Owner", "Baseline", "New", "Measured · Reported /wk", "Saved/mo", "Rolled out"].map((h) => (
                <th key={h} className="text-left p-3 text-[10px] tracking-[0.1em] uppercase text-[var(--dc-text-dim)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[var(--dc-text-dim)]">No rolled-out projects for this filter.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--dc-border)] hover:bg-[#9e9e9e]/[0.08]">
                <td className="p-3 text-[var(--dc-cyan)]">{r.role}</td>
                <td className="p-3">{r.task}</td>
                <td className="p-3">{r.owner}</td>
                <td className="p-3">{r.baseline}</td>
                <td className="p-3">{r.new_h}</td>
                <td className="p-3">
                  <span className="text-[var(--dc-cyan)]">{r.measured.toFixed(1)}</span>
                  {r.reported != null && (
                    <span className="text-[var(--dc-text-dim)]">
                      {" · "}<span className="text-[var(--dc-violet)]">{r.reported.toFixed(1)}</span>
                      {r.reported_by ? ` (${r.reported_by})` : ""}
                      {r.use_reported ? " ✓" : ""}
                    </span>
                  )}
                </td>
                <td className="p-3 text-[var(--dc-violet)]">{r.saved_month.toFixed(1)}</td>
                <td className="p-3 text-[var(--dc-text-dim)]">{r.rolled_out_date}</td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ INFO DIALOG ============================ */

function MandateInfoDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const sections: Array<{ title: string; body: string }> = [
    {
      title: "What this module is",
      body:
        "The strategic command layer of the Dev Center. It defines what you're trying to achieve (the mandate), maps every task you intend to automate, and tracks the hours you save so your commission can be calculated.",
    },
    {
      title: "Overview tab",
      body:
        "Shows your active mandate(s): title, target metric, incentive model, status, plus a live count of linked projects by status. 'New Mandate' lets you author a new strategic mandate. Each mandate is editable inline. The 'Stack' panel below lists the tools in use (the hosted builder, N8N, Close API, Claude), editable as your toolkit grows.",
    },
    {
      title: "Map tab",
      body:
        "A data-driven mind map. Top: the mandate. Below it: the seven roles (HR, SDR Manager, CSM, AE, Acquisition Setter, Fulfilment Setter, Developer), each showing its highest-ROI task. Under each role: the low-ROI tasks you plan to automate, colour-coded by build type (dashboard / workflow / agent) and badged by status (identified / building / testing / rolled out). Click a task to open its linked project, or to create one. The map updates automatically when roles or tasks change.",
    },
    {
      title: "Reporting tab",
      body:
        "Your monthly hours-saved report. Totals of hours saved per week and per month across rolled-out projects, broken down by role, with a per-role bar chart and a CSV export. Where a project has a user-reported figure, both the measured and reported values are shown.",
    },
    {
      title: "Measured vs reported hours",
      body:
        "Each project records a measured figure (baseline minus new hours) and, optionally, a figure reported by the person whose time was freed. The measured number is the objective backstop; the reported number is captured separately and shown alongside it. A per-project toggle decides which one feeds the totals.",
    },
    {
      title: "Build hierarchy",
      body:
        "Every task is classified as one of three build types, in order of preference: Dashboard (a metric calculation or UI, no automation logic) → Workflow (triggered sequences via N8N + Close API) → Agent (multi-step AI judgment). Most tasks are the first two; reserve agents for genuine judgment work.",
    },
    {
      title: "How a task moves through the system",
      body:
        "Identify the low-ROI task and log it as a target → record a baseline (how long it takes now) → build the automation → re-measure → mark it rolled out with its hours saved. Those saved hours flow into Mission Control and Reporting.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        style={{
          background: "#0E1014",
          borderColor: "#9fb3c8",
          color: "#e3e3e6",
        }}
      >
        <DialogHeader>
          <DialogTitle className="dc-mono" style={{ color: "#9fb3c8" }}>
            [ How the Mandate module works ]
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {sections.map((s) => (
            <div
              key={s.title}
              className="p-3 rounded"
              style={{ background: "#14161C", border: "1px solid rgba(120,140,255,0.16)" }}
            >
              <p
                className="dc-mono text-[10px] tracking-[0.2em] mb-2"
                style={{ color: "#7a7a80" }}
              >
                {s.title.toUpperCase()}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#e3e3e6" }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
