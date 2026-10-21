// The one "still with us" rule for the whole app (13 Oct 2026).
//
//   former  — profiles.offboarded_at is set. They have left. Hidden from every
//             live roster, picker, leaderboard and metric surface; shown only
//             under "Former" filters, with their leaving date.
//   benched — still with us, but their setter row is switched off (paused,
//             on leave, test account). Visible on staff lists, excluded from
//             working-setter metrics.
//   current — everyone else.
//
// The database keeps the two flags in step: stamping offboarded_at benches the
// setter row by trigger (migration 20261013200000), and `is_current_staff()`
// is the same predicate in SQL. Nothing should re-derive this elsewhere.

export type StaffStatus = "current" | "benched" | "former";

export interface StaffStatusInput {
  offboarded_at?: string | null;
  /** setters_profiles.active — undefined/null when the person has no setter row. */
  setter_active?: boolean | null;
}

export function staffStatusOf(p: StaffStatusInput): StaffStatus {
  if (p.offboarded_at) return "former";
  if (p.setter_active === false) return "benched";
  return "current";
}

export const isCurrentStaff = (p: StaffStatusInput) => !p.offboarded_at;

export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  current: "Active",
  benched: "Benched",
  former: "Former",
};

/** Tailwind classes for the status pill, matching the Employee Hub palette. */
export const STAFF_STATUS_CLASS: Record<StaffStatus, string> = {
  current: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  benched: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  former: "bg-gray-500/15 text-gray-500 border-gray-500/30",
};
