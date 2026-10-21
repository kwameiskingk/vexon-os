import { useMemo, useState } from "react";
import { useTaskTemplates, useTaskAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/useTaskTemplates";
import { useTeamUsers } from "@/hooks/useTeamUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Users, User as UserIcon, Search, Check, X, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const ROLES = ["admin", "dev", "ops", "csm", "account_executive", "sdr_manager", "setter", "hr", "finance", "accounting", "gtm_engineer", "ops_assistant"];
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", dev: "Dev", ops: "Operations", csm: "Client Success",
  account_executive: "Account Executive", sdr_manager: "SDR Manager",
  setter: "Setter", hr: "HR", finance: "Finance", accounting: "Accounting",
  gtm_engineer: "GTM Engineer", ops_assistant: "Ops Assistant",
};

type Mode = "role" | "users";

export const AssignmentMatrix = () => {
  const { data: templates = [] } = useTaskTemplates();
  const { data: assignments = [], isLoading } = useTaskAssignments();
  const { data: users = [] } = useTeamUsers();
  const create = useCreateAssignment();
  const del = useDeleteAssignment();

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("role");
  const [role, setRole] = useState<string>("setter");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const submit = () => {
    if (!templateId) return;
    if (mode === "role") {
      create.mutate({ template_task_id: templateId, assigned_role: role }, { onSuccess: reset });
    } else {
      if (selectedUserIds.length === 0) return;
      create.mutate({ template_task_id: templateId, assigned_user_ids: selectedUserIds }, { onSuccess: reset });
    }
  };

  const reset = () => {
    setOpen(false);
    setTemplateId("");
    setSelectedUserIds([]);
    setMode("role");
  };

  // Group assignments by template for the list
  const grouped = useMemo(() => {
    const byTemplate = new Map<string, typeof assignments>();
    assignments.forEach((a) => {
      if (!byTemplate.has(a.template_task_id)) byTemplate.set(a.template_task_id, [] as any);
      byTemplate.get(a.template_task_id)!.push(a);
    });
    return Array.from(byTemplate.entries()).map(([tid, list]) => {
      const tpl = templates.find((t) => t.id === tid);
      return { template: tpl, templateId: tid, list };
    }).sort((a, b) => (a.template?.title || "").localeCompare(b.template?.title || ""));
  }, [assignments, templates]);

  const userMap = useMemo(() => {
    const m = new Map<string, typeof users[number]>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Assignments</h2>
          <p className="text-xs text-muted-foreground">
            Connect templates to a role (everyone in the role) or to specific people.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New assignment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New assignment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Template</label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select a template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.filter((t) => t.active).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Assign to</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("role")}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      mode === "role" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 hover:border-border"
                    )}
                  >
                    <Users className={cn("h-4 w-4 mb-1", mode === "role" ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-sm font-medium">Entire role</div>
                    <div className="text-[11px] text-muted-foreground">Everyone in a role gets this</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("users")}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      mode === "users" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 hover:border-border"
                    )}
                  >
                    <UserIcon className={cn("h-4 w-4 mb-1", mode === "users" ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-sm font-medium">Specific people</div>
                    <div className="text-[11px] text-muted-foreground">Pick one or more individuals</div>
                  </button>
                </div>
              </div>

              {mode === "role" ? (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role</label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">People</label>
                  <UserMultiSelect users={users} selected={selectedUserIds} onChange={setSelectedUserIds} />
                </div>
              )}

              <Button
                onClick={submit}
                disabled={!templateId || create.isPending || (mode === "users" && selectedUserIds.length === 0)}
                className="w-full"
              >
                {create.isPending ? "Creating…" : "Create assignment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
          No assignments yet. Click <strong>New assignment</strong> to start.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ template, templateId, list }) => (
            <TemplateAssignmentGroup
              key={templateId}
              title={template?.title || "Unknown template"}
              list={list as any}
              userMap={userMap}
              onDelete={(id) => del.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TemplateAssignmentGroup = ({
  title, list, userMap, onDelete,
}: {
  title: string;
  list: any[];
  userMap: Map<string, { full_name: string | null; email: string | null }>;
  onDelete: (id: string) => void;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{list.length} assignment{list.length !== 1 ? "s" : ""}</div>
          </div>
          <Badge variant="outline" className="text-[10px] h-5">{list.length}</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border/30 border-t border-border/30">
          {list.map((a) => {
            const target =
              a.assigned_user_id ? userMap.get(a.assigned_user_id) : null;
            return (
              <div key={a.id} className="flex items-center gap-3 p-3 px-4">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {a.assigned_user_id ? <UserIcon className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  {a.assigned_user_id ? (
                    <>
                      <div className="text-sm font-medium truncate">{target?.full_name || target?.email || "Unknown user"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{target?.email}</div>
                    </>
                  ) : a.assigned_role ? (
                    <>
                      <div className="text-sm font-medium">All {ROLE_LABELS[a.assigned_role] || a.assigned_role}</div>
                      <div className="text-[11px] text-muted-foreground">Role-wide assignment</div>
                    </>
                  ) : a.assigned_department ? (
                    <>
                      <div className="text-sm font-medium capitalize">{a.assigned_department} department</div>
                      <div className="text-[11px] text-muted-foreground">Department-wide</div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Unknown target</div>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">since {a.start_date}</span>
                <Button variant="ghost" size="icon" onClick={() => onDelete(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const UserMultiSelect = ({
  users, selected, onChange,
}: {
  users: { id: string; full_name: string | null; email: string | null; role: string | null }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      (u.full_name || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term) ||
      (u.role || "").toLowerCase().includes(term)
    );
  }, [users, q]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectedUsers = users.filter((u) => selected.includes(u.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="text-sm">
              {selected.length === 0 ? "Select people…" : `${selected.length} selected`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, email, role…"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No matches</div>
            ) : (
              filtered.map((u) => {
                const isSel = selected.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors",
                      isSel && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      isSel ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    )}>
                      {isSel && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.full_name || u.email}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {u.email} {u.role ? `· ${u.role}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
              {u.full_name || u.email}
              <button
                onClick={() => toggle(u.id)}
                className="ml-1 hover:bg-background/50 rounded p-0.5"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
