// Department-head goals — CEO accountability log (department_head_goals,
// migration 20260730060000). A FOURTH goal concept, unrelated to
// individual_targets/resolveTargets (RAG), setter_weekly_goals (Morning
// Meeting) and setter_period_notes (reviews). Never wire it into any of
// those; it renders only on /admin/ceo/* surfaces.

export type HeadDepartment =
  | "sales"
  | "fulfilment"
  | "hr"
  | "client_health"
  | "dev"
  | "marketing"
  | "talent_acquisition";

/** Picker labels for every department a head can be assigned to. */
export const HEAD_DEPARTMENT_LABELS: Record<HeadDepartment, string> = {
  sales: "Sales",
  fulfilment: "Fulfilment",
  hr: "HR",
  client_health: "Client Health",
  dev: "Development",
  marketing: "Marketing",
  talent_acquisition: "Talent Acquisition",
};

export const HEAD_DEPARTMENT_OPTIONS = (Object.keys(HEAD_DEPARTMENT_LABELS) as HeadDepartment[]).map(
  (value) => ({ value, label: HEAD_DEPARTMENT_LABELS[value] }),
);

export const isHeadDepartment = (v: string | null | undefined): v is HeadDepartment =>
  !!v && Object.prototype.hasOwnProperty.call(HEAD_DEPARTMENT_LABELS, v);

export interface DepartmentHead {
  userId: string;
  name: string;
  department: HeadDepartment;
  deptLabel: string;
}

// KNOWN department → head mapping (user_ids verified against live profiles).
// Since 13 Sep 2026 this is no longer the only pool: any core-team member
// (src/lib/coreTeam.ts) can be picked as a head from the goals card, and a
// picked head persists for as long as they have goals. Rows here give a head
// a fixed card and label even in periods with no goals — and they also make
// the person core team by definition (see coreTeam.ts).
//
// Pruned 2 Sep 2026 (the owner's ruling — tight-knit team): Nadia Kowalski's two
// SDR-manager cards removed (offboarded 25 Aug; Marcus acts as SDR manager
// himself and doesn't set himself goals here) and Sofia Marin's Talent
// Acquisition card removed (offboarding; Elena runs recruiting — her
// existing card below covers her). Add rows back when real heads are hired.
//
// Elena's card reads "Executive Assistant" — the label is presentational
// only; her platform role remains `ops` and her department stays `hr`.
export const DEPARTMENT_HEADS: DepartmentHead[] = [
  {
    userId: "916e451a-9e25-4e27-89ab-a5f3374d81ac",
    name: "Elena Varga",
    department: "hr",
    deptLabel: "Executive Assistant",
  },
  {
    userId: "b55bfa88-fd26-46d6-8214-9d7aecf4064e",
    name: "Daniel Okoro",
    department: "client_health",
    deptLabel: "Client Health",
  },
  {
    userId: "206e0d24-02e5-4429-885b-eb13289ea9e2",
    name: "the product owner",
    department: "dev",
    deptLabel: "Development",
  },
  {
    userId: "42292222-46a0-4b2c-85b8-ecf3fca6415b",
    name: "Tom Reilly",
    department: "marketing",
    deptLabel: "Marketing",
  },
];

export const headForDepartment = (department: HeadDepartment) =>
  DEPARTMENT_HEADS.find((h) => h.department === department);

export interface GoalTypeOption {
  value: string;
  label: string;
}

export const CUSTOM_GOAL_TYPE = "custom";

// LEGACY preset goal types. Goals are free text since the 2026-08-06 ruling
// (every write is goal_type='custom' + goal_label); this map remains only so
// goalTypeLabel can render rows created under the old dropdown.
const DEPARTMENT_HEAD_GOAL_TYPES: Record<HeadDepartment, GoalTypeOption[]> = {
  sales: [
    { value: "meetings_booked", label: "Meetings booked" },
    { value: "meetings_sat", label: "Meetings sat" },
    { value: "cash_collected", label: "Cash collected" },
    { value: "follow_ups", label: "Follow-ups" },
    { value: "coaching_session", label: "Coaching session" },
    { value: "call_review", label: "Call review" },
    { value: "one_to_one", label: "One-to-one" },
  ],
  fulfilment: [
    { value: "meetings_booked", label: "Meetings booked" },
    { value: "meetings_sat", label: "Meetings sat" },
    { value: "coaching_session", label: "Coaching session" },
    { value: "call_review", label: "Call review" },
    { value: "one_to_one", label: "One-to-one" },
  ],
  hr: [
    { value: "screenings_booked", label: "Screenings booked" },
    { value: "live_call_trials_booked", label: "Live call trials booked" },
    { value: "final_interviews_booked", label: "Final interviews booked" },
    { value: "dials", label: "Dials" },
    { value: "talk_time", label: "Talk time" },
  ],
  client_health: [
    { value: "client_catch_ups", label: "Client catch-ups" },
    { value: "testimonials", label: "Testimonials" },
    { value: "onboardings", label: "Onboardings" },
  ],
  // Dev, Marketing and Talent Acquisition were added after the move to
  // free-text (custom) goals, so they have no legacy presets — goalTypeLabel
  // falls back to the raw value.
  dev: [],
  marketing: [],
  talent_acquisition: [],
};

export const goalTypeLabel = (department: HeadDepartment, goalType: string): string =>
  DEPARTMENT_HEAD_GOAL_TYPES[department].find((o) => o.value === goalType)?.label ?? goalType;

export type GoalPeriodType = "daily" | "weekly";
export type GoalOutcome = "hit" | "missed" | "exceeded";

export interface DepartmentHeadGoal {
  id: string;
  subject_user_id: string;
  department: HeadDepartment;
  period_type: GoalPeriodType;
  period_start: string;
  goal_type: string;
  goal_label: string | null;
  target_value: number | null;
  outcome: GoalOutcome | null;
  miss_reason: string | null;
  created_at: string;
  /**
   * Project this goal is tied to (migration 20260913150000). Optional because
   * the week-outcomes read doesn't select it; the card's main read does.
   */
  project_id?: string | null;
}
