// Projects tab (Marcus, approved by the owner 13 Sep 2026). Replaces the "Core
// Team Projects" block on the Executive Overview. Multi-contributor projects
// with a five-stage status, a person toggle that narrows to one contributor's
// projects and then their own daily tasks, and links from task templates and
// department-head goals. Degrades to an empty state + notice before
// migration 20260913150000 is run.

import { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Archive, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Chip } from "@/components/ui-v2";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useProjectsAccess } from "@/hooks/useProjectsAccess";
import { useProjectsOverview, type Project, type ProjectMember } from "@/hooks/useProjects";
import { useProfileLookup } from "@/hooks/useProfileLookup";
import { useCoreTeam } from "@/hooks/useCoreTeam";
import { coreTeamDisplayName } from "@/lib/coreTeam";
import { PROJECT_STATUSES, statusIndex } from "@/components/projects/projectStatus";
import { ProjectsMigrationNotice } from "@/components/projects/ProjectBits";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { ProjectsSummaryTiles } from "@/components/projects/ProjectsSummaryTiles";
import { EVERYONE, PersonFilter } from "@/components/projects/PersonFilter";
import { PersonTasksPanel } from "@/components/projects/PersonTasksPanel";
import { ProjectTasksInline } from "@/components/projects/ProjectTasksInline";
import { DepartmentHeadGoalsCard } from "@/components/ceo/DepartmentHeadGoalsCard";
import type { LinkedGoal } from "@/hooks/useProjects";

type SortMode = "status" | "due";
// Marcus, 16 Sep: head goals leave the CEO Overview and live here. "Projects"
// is the board with each project's tasks inline; "Tasks" is the head-goals
// card itself — everyone's tasks by day, with the streak strip.
type ViewMode = "projects" | "tasks";

export default function CEOProjects() {
  const { allowed, isLoading: accessLoading } = useProjectsAccess();
  const [showArchived, setShowArchived] = useState(false);
  const { data: overview, isLoading, error } = useProjectsOverview({ includeArchived: showArchived });
  const { nameFor, avatarFor } = useProfileLookup();
  const { data: team = [] } = useCoreTeam();
  const [person, setPerson] = useState<string>(EVERYONE);
  const [sort, setSort] = useState<SortMode>("status");
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("projects");

  const personId = person === EVERYONE ? null : person;
  const personName = personId
    ? (() => {
        const member = team.find((u) => u.id === personId);
        return member ? coreTeamDisplayName(member) : nameFor(personId);
      })()
    : null;

  // Archived projects are hidden by default; the toggle fetches them too and
  // they render in their own group at the bottom. The tiles only ever see live
  // projects, so "Active projects" cannot be inflated by the toggle.
  const liveOverview = useMemo(
    () => (overview ? { ...overview, projects: overview.projects.filter((p) => !p.archived_at) } : overview),
    [overview],
  );
  const archivedProjects = useMemo(() => (overview?.projects ?? []).filter((p) => !!p.archived_at), [overview]);

  const membersByProject = useMemo(() => {
    const m = new Map<string, ProjectMember[]>();
    (overview?.members ?? []).forEach((pm) => {
      const list = m.get(pm.project_id) ?? [];
      list.push(pm);
      m.set(pm.project_id, list);
    });
    return m;
  }, [overview?.members]);

  // Tasks shown under each project: this week's, plus older ones never marked.
  const goalsByProject = useMemo(() => {
    const m = new Map<string, LinkedGoal[]>();
    [...(overview?.weekGoals ?? []), ...(overview?.carriedGoals ?? [])].forEach((g) => {
      if (!g.project_id) return;
      const list = m.get(g.project_id) ?? [];
      if (!list.some((x) => x.id === g.id)) list.push(g);
      m.set(g.project_id, list);
    });
    return m;
  }, [overview?.weekGoals, overview?.carriedGoals]);

  const linkCounts = useMemo(() => {
    const tasks = new Map<string, number>();
    const goals = new Map<string, number>();
    (overview?.linkedTasks ?? []).forEach((t) => t.project_id && tasks.set(t.project_id, (tasks.get(t.project_id) ?? 0) + 1));
    (overview?.weekGoals ?? []).forEach((g) => g.project_id && goals.set(g.project_id, (goals.get(g.project_id) ?? 0) + 1));
    return { tasks, goals };
  }, [overview?.linkedTasks, overview?.weekGoals]);

  const forPerson = useCallback(
    (list: Project[]) =>
      personId ? list.filter((p) => (membersByProject.get(p.id) ?? []).some((m) => m.user_id === personId)) : list,
    [personId, membersByProject],
  );

  const visible = useMemo(() => {
    const filtered = forPerson(liveOverview?.projects ?? []);
    if (sort === "due") {
      return [...filtered].sort((a, b) => {
        const doneA = a.status === "done" ? 1 : 0;
        const doneB = b.status === "done" ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        if (!a.target_date && !b.target_date) return a.position - b.position;
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });
    }
    return filtered;
  }, [liveOverview?.projects, forPerson, sort]);

  const visibleArchived = useMemo(
    () => (showArchived ? forPerson(archivedProjects) : []),
    [showArchived, archivedProjects, forPerson],
  );

  // Grouped by stage (status order), or one flat list when sorting by date.
  const groups = useMemo(() => {
    if (sort === "due") return [{ key: "all", label: "By target date", projects: visible }];
    return PROJECT_STATUSES.map((s) => ({
      key: s.value,
      label: s.label,
      projects: visible.filter((p) => p.status === s.value).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
    })).filter((g) => g.projects.length > 0);
  }, [visible, sort]);

  if (accessLoading) return null;
  if (!allowed) return <Navigate to="/admin" replace />;

  const migrationPending = !!overview?.migrationPending;
  const total = liveOverview?.projects.length ?? 0;
  const nothingToShow = visible.length === 0 && visibleArchived.length === 0;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Projects"
          subtitle={personName
            ? `${personName.split(" ")[0]}'s projects, then their own daily tasks`
            : "Who is building what, where it is, and what is left day by day"}
          actions={
            <div className="flex flex-wrap items-center gap-[6px]">
              {(["projects", "tasks"] as ViewMode[]).map((v) => (
                <Chip key={v} selected={view === v} onClick={() => setView(v)}>{v === "tasks" ? "Tasks" : "Projects"}</Chip>
              ))}
              {view === "projects" && <span className="mx-1 h-4 w-px bg-[var(--line)]" />}
              {view === "projects" && <PersonFilter value={person} onChange={setPerson} />}
              {view === "projects" && (
                <>
                  <ButtonV2 size="sm" onClick={() => setSort((s) => (s === "status" ? "due" : "status"))} title="Toggle sort">
                    {sort === "status" ? "By status" : "By due date"}
                  </ButtonV2>
                  <ButtonV2
                    size="sm"
                    variant={showArchived ? "secondary" : "ghost"}
                    onClick={() => setShowArchived((v) => !v)}
                    aria-pressed={showArchived}
                    title={showArchived ? "Hide archived projects" : "Show archived projects"}
                    disabled={migrationPending}
                  >
                    {showArchived ? "Hide archived" : "Show archived"}
                  </ButtonV2>
                  <ButtonV2 size="sm" variant="primary" onClick={() => setCreateOpen(true)} disabled={migrationPending}>New project</ButtonV2>
                </>
              )}
            </div>
          }
        />

        {view === "tasks" ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
              Everyone's tasks by day. Add them here or straight onto a project on the Projects view — it's the same list.
            </p>
            <DepartmentHeadGoalsCard />
          </div>
        ) : (
        <div className="space-y-8">
          {migrationPending && <ProjectsMigrationNotice />}
          {error && !migrationPending && (
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400">
              Could not load projects{error instanceof Error && error.message ? ` — ${error.message}` : ""}.
            </p>
          )}

          {liveOverview && <ProjectsSummaryTiles overview={liveOverview} personId={personId} />}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-40 rounded-[8px] bg-[var(--surf2)] animate-pulse" />
              ))}
            </div>
          ) : total === 0 && nothingToShow ? (
            <EmptyState
              icon={FolderKanban}
              title={migrationPending ? "Projects aren't set up yet" : "No live projects"}
              description={
                migrationPending
                  ? "Once the migration has run, the old Core Team Projects carry over here automatically."
                  : archivedProjects.length > 0 && !showArchived
                    ? `${archivedProjects.length} archived ${archivedProjects.length === 1 ? "project is" : "projects are"} hidden. Create a new project or show the archived ones.`
                    : "Create the first project and add the people contributing to it."
              }
              action={migrationPending ? undefined : { label: "New project", onClick: () => setCreateOpen(true) }}
            >
              {!migrationPending && archivedProjects.length > 0 && !showArchived && (
                <Button variant="ghost" size="sm" className="mt-2 h-8 text-[12px] text-muted-foreground" onClick={() => setShowArchived(true)}>
                  <Archive className="h-3.5 w-3.5 mr-1" /> Show archived
                </Button>
              )}
            </EmptyState>
          ) : nothingToShow ? (
            <EmptyState
              icon={FolderKanban}
              title={`${personName?.split(" ")[0] ?? "They"} aren't on any project`}
              description="Add them as a contributor from a project's Edit dialog."
            />
          ) : (
            <div className="space-y-8">
              {groups.map((g) => (
                <section key={g.key} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">
                      {g.key !== "all" && (
                        <span className={cn("h-1.5 w-1.5 rounded-full", PROJECT_STATUSES[statusIndex(g.key)].dot)} />
                      )}
                      {g.label}
                    </span>
                    <div className="flex-1 h-px bg-border/70" />
                    <span className="text-[10.5px] text-muted-foreground tabular-nums">{g.projects.length}</span>
                  </div>
                  <div className="space-y-2">
                    {g.projects.map((p: Project) => (
                      <div key={p.id}>
                        <ProjectCard
                          project={p}
                          members={membersByProject.get(p.id) ?? []}
                          nameFor={nameFor}
                          avatarFor={avatarFor}
                          linkedTaskCount={linkCounts.tasks.get(p.id) ?? 0}
                          linkedGoalCount={linkCounts.goals.get(p.id) ?? 0}
                          variant="row"
                        />
                        <ProjectTasksInline
                          project={p}
                          members={membersByProject.get(p.id) ?? []}
                          goals={goalsByProject.get(p.id) ?? []}
                          nameFor={nameFor}
                          avatarFor={avatarFor}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {showArchived && visibleArchived.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">
                      <Archive className="h-3 w-3" />
                      Archived
                    </span>
                    <div className="flex-1 h-px bg-border/70" />
                    <span className="text-[10.5px] text-muted-foreground tabular-nums">{visibleArchived.length}</span>
                  </div>
                  <div className="space-y-2 opacity-70">
                    {visibleArchived.map((p: Project) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        members={membersByProject.get(p.id) ?? []}
                        nameFor={nameFor}
                        avatarFor={avatarFor}
                        linkedTaskCount={linkCounts.tasks.get(p.id) ?? 0}
                        linkedGoalCount={linkCounts.goals.get(p.id) ?? 0}
                        variant="row"
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {personId && personName && <PersonTasksPanel userId={personId} name={personName} />}
        </div>
        )}

        <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      </PageContainer>
    </DashboardLayout>
  );
}
