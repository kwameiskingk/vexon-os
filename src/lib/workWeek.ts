// Business work-week helpers for Goal Progress.
// Weeks run Monday–Friday. Saturday/Sunday activity is attributed to the
// preceding work week. Working days = Mon–Fri (no holiday calendar).

export function isWorkingDay(d: Date): boolean {
  const dow = d.getDay(); // 0=Sun..6=Sat
  return dow >= 1 && dow <= 5;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function getWorkingDaysInMonth(anyDayInMonth: Date): number {
  const first = firstOfMonth(anyDayInMonth);
  const last = lastOfMonth(anyDayInMonth);
  let n = 0;
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(d)) n++;
  }
  return n;
}

/**
 * Returns {monday, friday} for the work week containing `date`.
 * Saturday/Sunday attribute to the PRECEDING week (Mon–Fri prior).
 */
export function getWorkWeekRange(date: Date): { monday: Date; friday: Date } {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0=Sun..6=Sat
  // Days back to Monday: Mon=0, Tue=1..Fri=4, Sat=5, Sun=6
  const back = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - back);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { monday, friday };
}

/** Working days between two dates inclusive, clipped to same month if `clipToMonth` supplied. */
export function workingDaysBetween(
  from: Date,
  to: Date,
  clipToMonth?: Date,
): number {
  let start = startOfDay(from);
  let end = startOfDay(to);
  if (clipToMonth) {
    const mStart = firstOfMonth(clipToMonth);
    const mEnd = lastOfMonth(clipToMonth);
    if (start < mStart) start = mStart;
    if (end > mEnd) end = mEnd;
  }
  if (end < start) return 0;
  let n = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(d)) n++;
  }
  return n;
}

/**
 * Elapsed working days within the given work week up to `today` (inclusive if
 * today is a working day). If today is a weekend, counts all 5 working days
 * of the preceding week.
 */
export function elapsedWorkingDaysInWeek(today: Date, week: { monday: Date; friday: Date }): number {
  const t = startOfDay(today);
  const cap = t > week.friday ? week.friday : t;
  if (cap < week.monday) return 0;
  return workingDaysBetween(week.monday, cap);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * For a date on Sat/Sun, snap to the Friday of the preceding week so that
 * weekend activity attributes to that week.
 */
export function attributeToWorkWeek(d: Date): Date {
  const dow = d.getDay();
  if (dow === 0) {
    const x = new Date(d);
    x.setDate(d.getDate() - 2);
    return startOfDay(x);
  }
  if (dow === 6) {
    const x = new Date(d);
    x.setDate(d.getDate() - 1);
    return startOfDay(x);
  }
  return startOfDay(d);
}

export const GOAL_PROGRESS_MIN_DATE = new Date(2026, 6, 1); // 2026-07-01
