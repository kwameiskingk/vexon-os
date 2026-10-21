import { useEffect, useMemo, useState } from "react";
import { Crown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCoreTeam } from "@/hooks/useCoreTeam";
import { useProfileLookup } from "@/hooks/useProfileLookup";
import { CORE_TEAM_CAPTION } from "@/lib/coreTeam";
import { useProjectMutations, type MemberInput, type Project, type ProjectMember } from "@/hooks/useProjects";
import { NO_DEPARTMENT, PROJECT_DEPARTMENTS, PROJECT_STATUSES, type ProjectStatus } from "./projectStatus";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing project; omit to create. */
  project?: Project | null;
  members?: ProjectMember[];
  /**
   * When creating: contributors to pre-tick (e.g. the head whose goal editor
   * opened this dialog). Ignored when `project` is set.
   */
  defaultMembers?: MemberInput[];
  onSaved?: (projectId: string) => void;
}

export function ProjectDialog({ open, onOpenChange, project, members, defaultMembers, onSaved }: Props) {
  const { saveProject } = useProjectMutations();
  // Contributors come from the core team only (rule: src/lib/coreTeam.ts).
  const { data: team = [], isLoading: teamLoading } = useCoreTeam();
  const { map: profileById } = useProfileLookup();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<string>(NO_DEPARTMENT);
  const [status, setStatus] = useState<ProjectStatus>("due_to_start");
  const [targetDate, setTargetDate] = useState("");
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map()); // user_id → is_lead
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setDepartment(project?.department ?? NO_DEPARTMENT);
    setStatus(project?.status ?? "due_to_start");
    setTargetDate(project?.target_date ?? "");
    const seed: MemberInput[] = project ? (members ?? []) : (members ?? defaultMembers ?? []);
    setSelected(new Map(seed.map((m) => [m.user_id, m.is_lead])));
    setSearch("");
  }, [open, project, members, defaultMembers]);

  // Existing members outside the core team (offboarded, or added before the
  // core-team rule) are not in the live picker; keep them selectable so an
  // edit never silently drops them.
  const roster = useMemo(() => {
    const ids = new Set(team.map((t) => t.id));
    const extra = (members ?? [])
      .filter((m) => !ids.has(m.user_id))
      .map((m) => ({
        id: m.user_id,
        full_name: profileById.get(m.user_id)?.full_name ?? "Unknown",
        email: null as string | null,
        role: "not core team",
      }));
    return [...team, ...extra];
  }, [team, members, profileById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((u) => (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const toggleMember = (id: string) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, false);
      return next;
    });

  const toggleLead = (id: string) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (!next.has(id)) next.set(id, true);
      else next.set(id, !next.get(id));
      return next;
    });

  const valid = title.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    const memberInputs: MemberInput[] = Array.from(selected.entries()).map(([user_id, is_lead]) => ({ user_id, is_lead }));
    const id = await saveProject.mutateAsync({
      id: project?.id,
      title,
      description: description || null,
      department: department === NO_DEPARTMENT ? null : department,
      status,
      target_date: targetDate || null,
      members: memberInputs,
    });
    onOpenChange(false);
    onSaved?.(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Contributors see the project on their Projects tab. Mark one as the lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-title">Title</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Projects tab"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does done look like?"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPARTMENT}>None</SelectItem>
                  {PROJECT_DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-target">Target date</Label>
              <Input
                id="project-target"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Contributors
                <span className="ml-2 text-[10.5px] font-normal text-muted-foreground/80">{CORE_TEAM_CAPTION}</span>
              </Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {selected.size} selected
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the core team"
                className="pl-8 h-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
              {teamLoading ? (
                <div className="p-3 text-[12px] text-muted-foreground">Loading team…</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-[12px] text-muted-foreground">No one matches.</div>
              ) : (
                filtered.map((u) => {
                  const name = u.full_name || u.email || "Unknown";
                  const isSelected = selected.has(u.id);
                  const isLead = selected.get(u.id) === true;
                  return (
                    <div
                      key={u.id}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 text-[12.5px]",
                        isSelected ? "bg-primary/5" : "hover:bg-muted/40",
                      )}
                    >
                      <Checkbox
                        id={`member-${u.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleMember(u.id)}
                      />
                      <label htmlFor={`member-${u.id}`} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <UserAvatar name={name} size="xs" />
                        <span className="truncate">{name}</span>
                        {u.role && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                            {u.role.replace(/_/g, " ")}
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleLead(u.id)}
                        title={isLead ? "Lead — click to unset" : "Make lead"}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                          isLead
                            ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Crown className={cn("h-3 w-3", isLead && "fill-amber-400")} />
                        Lead
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveProject.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || saveProject.isPending}>
            {saveProject.isPending ? "Saving…" : project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
