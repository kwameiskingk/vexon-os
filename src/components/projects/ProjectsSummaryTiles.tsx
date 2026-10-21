import { useMemo, useState } from "react";
import { CEOKpiTile } from "@/components/ceo/CEOKpiTile";
import { fmtNumber } from "@/components/ceo/ceoTheme";
import { currentWeek, instanceOutcome, type ProjectsOverview } from "@/hooks/useProjects";
import { PROJECT_STATUSES } from "./projectStatus";

type Key = "active" | "due" | "tasks" | "goals" | null;

interface Props {
  overview: ProjectsOverview;
  /** Filter to one person's projects (member) when set. */
  personId: string | null;
}

export function ProjectsSummaryTiles({ overview, personId }: Props) {
  const [expanded, setExpanded] = useState<Key>(null);
  const toggle = (k: Exclude<Key, null>) => setExpanded((c) => (c === k ? null : k));

  const stats = useMemo(() => {
    const week = currentWeek();
    const memberOf = new Set(
      personId ? overview.members.filter((m) => m.user_id === personId).map((m) => m.project_id) : [],
    );
    const projects = personId ? overview.projects.filter((p) => memberOf.has(p.id)) : overview.projects;
    const projectIds = new Set(projects.map((p) => p.id));

    const active = projects.filter((p) => p.status !== "done");
    const byStatus = PROJECT_STATUSES.map((s) => ({
      label: s.label,
      value: fmtNumber(projects.filter((p) => p.status === s.value).length),
    }));

    const dueThisWeek = active.filter((p) => p.target_date && p.target_date >= week.start && p.target_date <= week.end);
    const overdue = active.filter((p) => p.target_date && p.target_date < week.today);
    const noDate = active.filter((p) => !p.target_date);

    const linkedTemplateIds = new Set(
      overview.linkedTasks.filter((t) => t.project_id && projectIds.has(t.project_id)).map((t) => t.id),
    );
    let hit = 0;
    let missed = 0;
    let pending = 0;
    for (const inst of overview.weekInstances) {
      if (!inst.template_task_id || !linkedTemplateIds.has(inst.template_task_id)) continue;
      const o = instanceOutcome(inst, week.today);
      if (o === "hit") hit += 1;
      else if (o === "missed") missed += 1;
      else pending += 1;
    }

    const goals = overview.weekGoals.filter((g) => g.project_id && projectIds.has(g.project_id));
    const goalHit = goals.filter((g) => g.outcome === "hit" || g.outcome === "exceeded").length;
    const goalMissed = goals.filter((g) => g.outcome === "missed").length;
    const goalMarked = goalHit + goalMissed;
    const goalUnmarked = goals.length - goalMarked;

    return {
      active,
      byStatus,
      dueThisWeek,
      overdue,
      noDate,
      hit,
      missed,
      pending,
      linkedTemplates: linkedTemplateIds.size,
      goals,
      goalHit,
      goalMissed,
      goalMarked,
      goalUnmarked,
    };
  }, [overview, personId]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      <CEOKpiTile
        label="Active projects"
        value={fmtNumber(stats.active.length)}
        expanded={expanded === "active"}
        onToggle={() => toggle("active")}
        details={{
          rationale: "Projects not yet marked done. Archived projects are excluded.",
          rows: stats.byStatus,
        }}
      />
      <CEOKpiTile
        label="Due this week"
        value={fmtNumber(stats.dueThisWeek.length)}
        delta={stats.overdue.length > 0 ? { value: `${stats.overdue.length} overdue`, tone: "down" } : null}
        expanded={expanded === "due"}
        onToggle={() => toggle("due")}
        details={{
          rationale: "Active projects whose target date falls Monday to Sunday this week (London time).",
          rows: [
            ...stats.dueThisWeek.slice(0, 6).map((p) => ({ label: p.title, value: p.target_date ?? "" })),
            { label: "Overdue", value: fmtNumber(stats.overdue.length) },
            { label: "No target date", value: fmtNumber(stats.noDate.length) },
          ],
        }}
      />
      <CEOKpiTile
        label="Linked tasks this week"
        value={stats.hit + stats.missed === 0 ? "—" : `${stats.hit} hit · ${stats.missed} missed`}
        expanded={expanded === "tasks"}
        onToggle={() => toggle("tasks")}
        details={{
          rationale:
            "Daily task instances for templates linked to a project. Done = hit; skipped or left open past its day = missed.",
          rows: [
            { label: "Templates linked", value: fmtNumber(stats.linkedTemplates) },
            { label: "Hit", value: fmtNumber(stats.hit) },
            { label: "Missed", value: fmtNumber(stats.missed) },
            { label: "Still open today", value: fmtNumber(stats.pending) },
          ],
        }}
      />
      <CEOKpiTile
        label="Head goals hit this week"
        value={stats.goalMarked === 0 ? "—" : `${stats.goalHit}/${stats.goalMarked}`}
        highlight={stats.goalMarked > 0 && stats.goalMissed === 0}
        expanded={expanded === "goals"}
        onToggle={() => toggle("goals")}
        details={{
          rationale: "Department-head goals linked to a project this week. Hit and exceeded both count as hit.",
          rows: [
            { label: "Goals linked", value: fmtNumber(stats.goals.length) },
            { label: "Hit / exceeded", value: fmtNumber(stats.goalHit) },
            { label: "Missed", value: fmtNumber(stats.goalMissed) },
            { label: "Not yet marked", value: fmtNumber(stats.goalUnmarked) },
          ],
        }}
      />
    </div>
  );
}
