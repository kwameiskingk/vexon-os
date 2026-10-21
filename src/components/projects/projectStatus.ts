// Project status vocabulary (migration 20260913150000). Deliberately NOT the
// task hit/miss scale — Marcus's ruling: a project moves through five stages
// while the tasks feeding it are marked hit or miss day by day.

export type ProjectStatus = "due_to_start" | "started" | "halfway" | "testing" | "done";

export interface ProjectStatusMeta {
  value: ProjectStatus;
  label: string;
  /** Short label for the stepper on narrow screens. */
  short: string;
  /** Canonical % written to progress_pct when the stage changes. */
  pct: number;
  /** Chip classes (theme tokens + tailwind palette, no brand hexes). */
  chip: string;
  /** Solid dot / active-step classes. */
  dot: string;
}

export const PROJECT_STATUSES: ProjectStatusMeta[] = [
  {
    value: "due_to_start",
    label: "Due to start",
    short: "Due",
    pct: 0,
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  {
    value: "started",
    label: "Started",
    short: "Started",
    pct: 25,
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  {
    value: "halfway",
    label: "Halfway",
    short: "Halfway",
    pct: 50,
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    value: "testing",
    label: "Testing",
    short: "Testing",
    pct: 75,
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  {
    value: "done",
    label: "Done",
    short: "Done",
    pct: 100,
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
];

export const statusMeta = (status: string): ProjectStatusMeta =>
  PROJECT_STATUSES.find((s) => s.value === status) ?? PROJECT_STATUSES[0];

export const statusIndex = (status: string): number =>
  Math.max(0, PROJECT_STATUSES.findIndex((s) => s.value === status));

export const PROJECT_DEPARTMENTS: { value: string; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "ops", label: "Operations / Fulfilment" },
  { value: "hr", label: "HR / Hiring" },
  { value: "dev", label: "Dev" },
  { value: "other", label: "Other" },
];

/** Sentinel for "no department" in a Select (Radix Select forbids empty values). */
export const NO_DEPARTMENT = "__none__";

export const PROJECTS_MIGRATION_NOTICE =
  "Projects aren't set up yet — run migration 20260913150000";
