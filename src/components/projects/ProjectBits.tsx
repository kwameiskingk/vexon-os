// Small shared pieces for the Projects tab: migration notice, status chip,
// department chip, target-date meta, member avatar stack.

import { AlertTriangle, Crown } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { INITIATIVE_DEPT_COLOURS, INITIATIVE_DEPT_LABELS } from "@/components/ceo/ceoTheme";
import { dateAtNoon } from "@/hooks/useDepartmentHeadGoals";
import { PROJECTS_MIGRATION_NOTICE, statusMeta } from "./projectStatus";
import type { ProjectMember } from "@/hooks/useProjects";

export function ProjectsMigrationNotice({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{PROJECTS_MIGRATION_NOTICE}</span>
    </div>
  );
}

export function ProjectStatusChip({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
        meta.chip,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function DepartmentChip({ department }: { department: string | null }) {
  if (!department) return null;
  const label = INITIATIVE_DEPT_LABELS[department] || department;
  const colour = INITIATIVE_DEPT_COLOURS[department];
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground"
      style={colour ? { backgroundColor: `${colour}15`, color: colour } : undefined}
    >
      {label}
    </span>
  );
}

export const departmentColour = (department: string | null) =>
  (department && INITIATIVE_DEPT_COLOURS[department]) || undefined;

export interface TargetDateMeta {
  date: string;
  hint: string | null;
  tone: "overdue" | "today" | "soon" | "normal";
}

export function targetDateMeta(targetDate: string | null, done: boolean): TargetDateMeta {
  if (!targetDate) return { date: "No target date", hint: null, tone: "normal" };
  const d = dateAtNoon(targetDate);
  const date = format(d, "d MMM");
  if (done) return { date, hint: null, tone: "normal" };
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return { date, hint: `${Math.abs(days)}d overdue`, tone: "overdue" };
  if (days === 0) return { date, hint: "today", tone: "today" };
  if (days <= 7) return { date, hint: `${days}d left`, tone: "soon" };
  return { date, hint: `${days}d left`, tone: "normal" };
}

export const targetToneClass: Record<TargetDateMeta["tone"], string> = {
  overdue: "text-rose-600 dark:text-rose-400",
  today: "text-amber-600 dark:text-amber-400",
  soon: "text-amber-600 dark:text-amber-400",
  normal: "text-muted-foreground",
};

interface AvatarStackProps {
  members: ProjectMember[];
  nameFor: (id: string) => string;
  avatarFor: (id: string) => string | null;
  max?: number;
  size?: "xs" | "sm";
  className?: string;
}

export function MemberAvatarStack({
  members,
  nameFor,
  avatarFor,
  max = 4,
  size = "xs",
  className,
}: AvatarStackProps) {
  if (members.length === 0) {
    return <span className={cn("text-[11px] text-muted-foreground", className)}>No contributors</span>;
  }
  const ordered = [...members].sort((a, b) => Number(b.is_lead) - Number(a.is_lead));
  const shown = ordered.slice(0, max);
  const extra = ordered.length - shown.length;
  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-1.5">
        {shown.map((m) => (
          <span key={m.user_id} title={`${nameFor(m.user_id)}${m.is_lead ? " (lead)" : ""}`} className="relative">
            <UserAvatar
              name={nameFor(m.user_id)}
              avatarUrl={avatarFor(m.user_id)}
              size={size}
              className="ring-2 ring-card"
            />
            {m.is_lead && (
              <Crown
                aria-hidden
                className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-500 fill-amber-400"
              />
            )}
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-1.5 text-[10.5px] font-medium text-muted-foreground tabular-nums">+{extra}</span>
      )}
    </div>
  );
}
