// One project: status stepper, contributors, then two full-width columns —
// every task template ever linked (with owners and their hit/miss record) and
// every department-head goal linked (with outcome). The daily log was dropped
// on 14 Sep (Marcus: the tasks are the daily record; nobody fills in
// blockers) — project_updates and saveDailyUpdate stay in the hook, unused.

import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, CalendarDays, Crown, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useProjectsAccess } from "@/hooks/useProjectsAccess";
import { useProjectDetail, useProjectMutations } from "@/hooks/useProjects";
import { useProfileLookup } from "@/hooks/useProfileLookup";
import { ProjectsMigrationNotice, DepartmentChip, ProjectStatusChip, targetDateMeta, targetToneClass } from "@/components/projects/ProjectBits";
import { ProjectStatusStepper } from "@/components/projects/ProjectStatusStepper";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { ProjectLinkedTasks } from "@/components/projects/ProjectLinkedTasks";
import { ProjectLinkedGoals } from "@/components/projects/ProjectLinkedGoals";

export default function CEOProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allowed, isLoading: accessLoading } = useProjectsAccess();
  const { data, isLoading, error } = useProjectDetail(id);
  const { nameFor, avatarFor } = useProfileLookup();
  const { setStatus, archiveProject, deleteProject } = useProjectMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (accessLoading) return null;
  if (!allowed) return <Navigate to="/admin" replace />;

  const project = data?.project ?? null;
  const migrationPending = !!data?.migrationPending;
  const target = project ? targetDateMeta(project.target_date, project.status === "done") : null;
  const lead = data?.members.find((m) => m.is_lead) ?? null;

  const onArchive = () => {
    if (!project) return;
    if (!window.confirm(`Archive "${project.title}"? It leaves the board but nothing is deleted.`)) return;
    archiveProject.mutate(project.id, { onSuccess: () => navigate("/admin/ceo/projects") });
  };

  // Permanent. Offered for archived projects too so old ones can be cleared out.
  const onDelete = () => {
    if (!project) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        navigate("/admin/ceo/projects");
      },
    });
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="mb-5 animate-fade-in">
          <Link
            to="/admin/ceo/projects"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All projects
          </Link>
        </div>

        {migrationPending ? (
          <div className="space-y-4">
            <ProjectsMigrationNotice />
            <EmptyState title="Projects aren't set up yet" description="Run the migration, then come back to this link." />
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="h-10 w-2/3 rounded-lg bg-muted animate-pulse" />
            <div className="h-16 rounded-xl bg-muted animate-pulse" />
            <div className="h-64 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-[12.5px] text-rose-600 dark:text-rose-400">
            Could not load this project{error instanceof Error && error.message ? ` — ${error.message}` : ""}.
          </p>
        ) : !project ? (
          <EmptyState
            title="Project not found"
            description="It may have been archived, or you aren't a contributor on it."
            action={{ label: "Back to projects", onClick: () => navigate("/admin/ceo/projects") }}
          />
        ) : (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <DepartmentChip department={project.department} />
                  <ProjectStatusChip status={project.status} />
                  {project.archived_at && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Archived</span>
                  )}
                </div>
                <h1 className="text-[26px] font-heading font-semibold tracking-tight leading-tight text-foreground">
                  {project.title}
                </h1>
                {project.description && (
                  <p className="text-[13px] text-muted-foreground max-w-2xl whitespace-pre-wrap">{project.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  {target && (
                    <span className={cn("inline-flex items-center gap-1", targetToneClass[target.tone])}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      Target {target.date}
                      {target.hint && <span className="font-medium">· {target.hint}</span>}
                    </span>
                  )}
                  {lead && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                      Lead: {nameFor(lead.user_id)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="h-9 text-[12px]" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                {!project.archived_at && (
                  <Button variant="ghost" size="sm" className="h-9 text-[12px] text-muted-foreground" onClick={onArchive} disabled={archiveProject.isPending}>
                    <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-[12px] text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleteProject.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>

            {/* Status */}
            <section className="space-y-3">
              <SectionLabel label="Status" hint="Click a stage to move the project" />
              <ProjectStatusStepper
                status={project.status}
                disabled={setStatus.isPending}
                onChange={(status) => status !== project.status && setStatus.mutate({ id: project.id, status })}
              />
            </section>

            {/* Contributors */}
            <section className="space-y-3">
              <SectionLabel label="Contributors" hint={`${data.members.length} on this project`} />
              {data.members.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  No one yet —{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setEditOpen(true)}>
                    add contributors
                  </button>
                  .
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {data.members.map((m) => (
                    <li
                      key={m.user_id}
                      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card pl-1 pr-3 py-1 text-[12px]"
                    >
                      <UserAvatar name={nameFor(m.user_id)} avatarUrl={avatarFor(m.user_id)} size="xs" />
                      <span>{nameFor(m.user_id)}</span>
                      {m.is_lead && <Crown className="h-3 w-3 text-amber-500 fill-amber-400" aria-label="Lead" />}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Tasks, then goals — one column (15 Sep, Marcus: read up-down) */}
            <div className="grid grid-cols-1 gap-6 items-start">
              <section className="rounded-xl border border-border/60 bg-card shadow-sm p-4">
                <ProjectLinkedTasks
                  projectId={project.id}
                  tasks={data.linkedTasks}
                  history={data.taskHistory}
                  assignments={data.taskAssignments}
                  nameFor={nameFor}
                  avatarFor={avatarFor}
                  canManage
                />
              </section>
              <section className="rounded-xl border border-border/60 bg-card shadow-sm p-4">
                <ProjectLinkedGoals
                  projectId={project.id}
                  goals={data.linkedGoals}
                  nameFor={nameFor}
                  avatarFor={avatarFor}
                  canManage
                />
              </section>
            </div>

            <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} members={data.members} />

            <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteProject.isPending && setDeleteOpen(o)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{project.title}"?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-[13px]">
                      <p>
                        This removes the project permanently, including its contributor list. It cannot be
                        undone.
                      </p>
                      <p>
                        Linked tasks and department-head goals are kept — they just stop pointing at this
                        project.
                      </p>
                      <p className="text-muted-foreground">If you only want it off the board, use Archive instead.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 text-white hover:bg-rose-700"
                    disabled={deleteProject.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      onDelete();
                    }}
                  >
                    {deleteProject.isPending ? "Deleting…" : "Delete project"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </PageContainer>
    </DashboardLayout>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">{label}</span>
      <div className="flex-1 h-px bg-border/70" />
      {hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
