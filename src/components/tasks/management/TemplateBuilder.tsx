import { useMemo, useState } from "react";
import { useTaskTemplates, useCreateTemplate, useToggleTemplateActive, TaskTemplate } from "@/hooks/useTaskTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronDown, ClipboardList, Repeat, Link2, Briefcase, FolderKanban } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useProjectOptions } from "@/hooks/useProjects";
import { ProjectDialog } from "@/components/projects/ProjectDialog";

// Radix Select can't carry an empty-string item; sentinels never collide
// with a uuid.
const NO_PROJECT = "none";
const NEW_PROJECT = "__new__";

const ROLES = ["admin", "dev", "ops", "csm", "account_executive", "sdr_manager", "setter", "hr", "finance", "accounting", "gtm_engineer", "ops_assistant"];
const LINK_TYPES = ["custom", "form_sod", "form_eod", "meeting_log", "discovery_call", "follow_up_call", "confirmation_call", "call_review"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", dev: "Dev", ops: "Operations", csm: "Client Success",
  account_executive: "Account Executive", sdr_manager: "SDR Manager",
  setter: "Setter", hr: "HR", finance: "Finance", accounting: "Accounting",
  gtm_engineer: "GTM Engineer", ops_assistant: "Ops Assistant",
};

export const TemplateBuilder = () => {
  const { data: templates = [], isLoading } = useTaskTemplates();
  const create = useCreateTemplate();
  const toggleActive = useToggleTemplateActive();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<TaskTemplate>>({
    title: "", description: "", category: "task", recurrence: "daily",
    target_role: "setter", link_type: "custom", priority: "normal",
  });

  // Project the template feeds (Projects tab). Pre-migration the picker
  // simply doesn't render and project_id is never sent, so the insert
  // behaves exactly as before. "+ New project…" opens the project dialog
  // on top of this one and links the template to whatever gets created.
  const projectOptionsQuery = useProjectOptions();
  const projectsReady = !!projectOptionsQuery.data && !projectOptionsQuery.data.migrationPending;
  const liveProjects = projectOptionsQuery.data?.live ?? [];
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Title of a project created from here, until the options list refetches.
  const [justCreated, setJustCreated] = useState<{ id: string; title: string } | null>(null);
  const projectItems =
    justCreated && !liveProjects.some((p) => p.id === justCreated.id)
      ? [...liveProjects, { id: justCreated.id, title: justCreated.title }]
      : liveProjects;

  const submit = () => {
    if (!form.title?.trim()) return;
    create.mutate(
      { ...form, ...(projectsReady && projectId ? { project_id: projectId } : {}) },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ title: "", description: "", category: "task", recurrence: "daily", target_role: "setter", link_type: "custom", priority: "normal" });
          setProjectId(null);
          setJustCreated(null);
        },
      },
    );
  };

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = templates.filter(
      (t) => !q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
    );
    const map = new Map<string, TaskTemplate[]>();
    filtered.forEach((t) => {
      const key = t.target_role || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    // sort roles by count desc, then alpha
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [templates, search]);

  return (
    <div className="space-y-5">
      {/* Header / actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Templates Library</h2>
          <p className="text-xs text-muted-foreground">
            Define reusable tasks & responsibilities. Assign them to roles or specific people in the Assignments tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-8 h-9 w-56"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New template</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Approve pending meetings" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What needs to happen?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">Task (one-off)</SelectItem>
                        <SelectItem value="responsibility">Responsibility (ongoing)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Recurrence</Label>
                    <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Once</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Default role</Label>
                    <Select value={form.target_role || ""} onValueChange={(v) => setForm({ ...form, target_role: v })}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Linked form / action</Label>
                    <Select value={form.link_type || "custom"} onValueChange={(v) => setForm({ ...form, link_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LINK_TYPES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {projectsReady && (
                  <div>
                    <Label>Project</Label>
                    <Select
                      value={projectId ?? NO_PROJECT}
                      onValueChange={(v) => {
                        if (v === NEW_PROJECT) setProjectOpen(true);
                        else setProjectId(v === NO_PROJECT ? null : v);
                      }}
                    >
                      <SelectTrigger aria-label="Project">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="No project" />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT} className="text-muted-foreground">No project</SelectItem>
                        {projectItems.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={NEW_PROJECT} className="text-primary">+ New project…</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Its hit/miss record then shows on that project's page.
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  After creating, head to <strong>Assignments</strong> to give it to a role or specific people.
                </p>
                <Button onClick={submit} disabled={create.isPending} className="w-full">
                  {create.isPending ? "Creating…" : "Create template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <ProjectDialog
            open={projectOpen}
            onOpenChange={setProjectOpen}
            onSaved={(id) => {
              setProjectId(id);
              setJustCreated({ id, title: "New project" });
            }}
          />
        </div>
      </div>

      {/* Grouped collapsible list */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
          No templates yet. Click <strong>New template</strong> to create your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([role, items]) => (
            <RoleGroup key={role} role={role} items={items} onToggle={(id, v) => toggleActive.mutate({ id, active: v })} />
          ))}
        </div>
      )}
    </div>
  );
};

const RoleGroup = ({ role, items, onToggle }: { role: string; items: TaskTemplate[]; onToggle: (id: string, v: boolean) => void }) => {
  const [open, setOpen] = useState(true);
  const activeCount = items.filter((i) => i.active).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold">{ROLE_LABELS[role] || role}</div>
            <div className="text-[11px] text-muted-foreground">
              {items.length} template{items.length !== 1 ? "s" : ""} · {activeCount} active
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] h-5">{items.length}</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border/30 border-t border-border/30">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 px-4 hover:bg-muted/20 transition-colors">
              <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", t.active ? "bg-success" : "bg-muted-foreground/30")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{t.title}</span>
                  <Badge variant="outline" className="text-[10px] h-4 capitalize">
                    {t.category === "responsibility" ? <ClipboardList className="h-2.5 w-2.5 mr-1" /> : null}
                    {t.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-4 capitalize">
                    <Repeat className="h-2.5 w-2.5 mr-1" /> {t.recurrence}
                  </Badge>
                  {t.link_type && t.link_type !== "custom" && (
                    <Badge variant="outline" className="text-[10px] h-4 border-primary/40 text-primary">
                      <Link2 className="h-2.5 w-2.5 mr-1" /> {t.link_type}
                    </Badge>
                  )}
                </div>
                {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.description}</p>}
              </div>
              <Switch checked={t.active} onCheckedChange={(v) => onToggle(t.id, v)} />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
