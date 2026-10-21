import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, ProjectMember } from "@/hooks/useProjects";
import {
  DepartmentChip,
  MemberAvatarStack,
  ProjectStatusChip,
  departmentColour,
  targetDateMeta,
  targetToneClass,
} from "./ProjectBits";

interface Props {
  project: Project;
  members: ProjectMember[];
  nameFor: (id: string) => string;
  avatarFor: (id: string) => string | null;
  /** Linked-task / goal counts for the footer, if known. */
  linkedTaskCount?: number;
  linkedGoalCount?: number;
  /**
   * "row" (15 Sep, Marcus): one line per project, read top to bottom, instead
   * of the four-up card wall. Same data, same click target.
   */
  variant?: "card" | "row";
}

export function ProjectCard({ project, members, nameFor, avatarFor, linkedTaskCount = 0, linkedGoalCount = 0, variant = "card" }: Props) {
  const navigate = useNavigate();
  const stripe = departmentColour(project.department);
  const target = targetDateMeta(project.target_date, project.status === "done");
  const href = `/admin/ceo/projects/${project.id}`;

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={() => navigate(href)}
        className={cn(
          "group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left shadow-sm",
          "transition-colors hover:border-border hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute left-0 top-0 bottom-0 w-0.5", !stripe && "bg-primary/60")}
          style={stripe ? { backgroundColor: stripe } : undefined}
        />
        <span className="shrink-0 pl-1.5">
          <DepartmentChip department={project.department} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-snug tracking-tight text-foreground">
            {project.title}
          </span>
          {project.description && (
            <span className="block truncate text-[11.5px] text-muted-foreground">{project.description}</span>
          )}
        </span>
        <span className="hidden shrink-0 tabular-nums text-[10.5px] text-muted-foreground sm:inline">
          {linkedTaskCount} task{linkedTaskCount === 1 ? "" : "s"} · {linkedGoalCount} goal{linkedGoalCount === 1 ? "" : "s"}
        </span>
        <span className="hidden shrink-0 md:inline">
          <MemberAvatarStack members={members} nameFor={nameFor} avatarFor={avatarFor} />
        </span>
        <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px]", targetToneClass[target.tone])}>
          <CalendarDays className="h-3 w-3" />
          {target.date}
          {target.hint && <span className="font-medium">· {target.hint}</span>}
        </span>
        <span className="shrink-0">
          <ProjectStatusChip status={project.status} />
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={cn(
        "group relative w-full text-left rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden",
        "transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      <div
        aria-hidden
        className={cn("absolute left-0 top-0 bottom-0 w-0.5", !stripe && "bg-primary/60")}
        style={stripe ? { backgroundColor: stripe } : undefined}
      />
      <div className="pl-4 pr-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <DepartmentChip department={project.department} />
          </div>
          <ProjectStatusChip status={project.status} />
        </div>

        <h3 className="text-[13px] font-semibold leading-snug text-foreground tracking-tight line-clamp-2">
          {project.title}
        </h3>
        {project.description && (
          <p className="text-[11.5px] text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <MemberAvatarStack members={members} nameFor={nameFor} avatarFor={avatarFor} />
          <span className={cn("inline-flex items-center gap-1 text-[11px] whitespace-nowrap", targetToneClass[target.tone])}>
            <CalendarDays className="h-3 w-3" />
            {target.date}
            {target.hint && <span className="font-medium">· {target.hint}</span>}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground border-t border-border/40 pt-2">
          <span className="tabular-nums">
            {linkedTaskCount} task{linkedTaskCount === 1 ? "" : "s"} · {linkedGoalCount} goal{linkedGoalCount === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-0.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            Open <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}
