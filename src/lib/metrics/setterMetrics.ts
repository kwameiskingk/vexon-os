// Shared per-setter metric computations — single source of truth.
//
// Extracted from SetterMetricsPresenter (Ops Command metrics carousel) and
// useCEOSnapshot so every surface that reports a setter number — leaderboards,
// CEO tiles, Ops Command, and the monthly performance review — calls the SAME
// implementation. Never re-derive these formulas inline; import them.
//
// Domain rules honoured here (do not "fix"):
// - Meetings with is_rebook=true are excluded upstream at the query level for
//   leaderboard-style counts; these helpers assume the rows they receive are
//   already the correct population.
// - A meeting counts as SAT when attendance_confirmed is true OR
//   attendance_status = 'sat' (the useCEOSnapshot predicate).
// - Connect / connects_3_plus_mins are defined by the Close sync upstream;
//   the app never re-derives them from disposition + duration.

export interface CloseMetricRow {
  close_user_id: string;
  date: string;
  dials: number | null;
  talk_time_seconds: number | null;
  connects: number | null;
  connects_3_plus_mins: number | null;
}

export interface ActivityRow {
  created_at: string;
}

export interface ManualRow {
  date: string;
  conversations: number | null;
  warm_leads: number | null;
  meetings_booked_input: number | null;
}

export interface SetterActivityTotals {
  dials: number;
  talkSeconds: number;
  conversations: number;
  connects3Plus: number;
  meetings: number;
  warmLeads: number;
  connectRate: number;
  verified: { conversations: boolean; meetings: boolean; warmLeads: boolean };
}

/** SAT predicate for meetings-table rows (useCEOSnapshot definition). */
export const isMeetingSat = (m: {
  attendance_confirmed?: boolean | null;
  attendance_status?: string | null;
}): boolean => m.attendance_confirmed === true || m.attendance_status === "sat";

/**
 * Sit / show-up rate as a percentage; null when nothing was booked.
 * Deliberately NOT capped at 100 — sat meetings can include meetings booked
 * in a prior period, so >100% is correct behaviour, not a bug.
 */
export const computeSitRatePct = (sat: number, booked: number): number | null =>
  booked > 0 ? (sat / booked) * 100 : null;

/** Ratio with a divide-by-zero guard: null (rendered "—"), never NaN/Infinity. */
export const safeRatio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

export interface AttendanceStatusRow {
  status: string;
}

/**
 * The worked-fraction an attendance status contributes: present/late = 1,
 * half_day = 0.5, absent/unmarked = 0. THE single definition — the review's
 * days-worked divisor and the RAG pace expectation both derive from it.
 */
export const attendanceDayValue = (status: string): number => {
  if (status === "present" || status === "late") return 1;
  if (status === "half_day") return 0.5;
  return 0;
};

/**
 * Days actually worked, from the Ops Command attendance capture
 * (employee_attendance): present and late each count 1, half_day counts 0.5,
 * absent and unmarked days count 0. Fractional results (e.g. 18.5) are
 * expected. This — not calendar working days — is the divisor for the
 * performance review's daily averages. Pure over whatever rows it is given,
 * so partial in-progress periods work by filtering the rows first.
 */
export const daysWorkedFromAttendance = (rows: AttendanceStatusRow[]): number =>
  rows.reduce((sum, r) => sum + attendanceDayValue(r.status), 0);

/** Percentage change vs a prior value; null when there is no prior baseline. */
export const pctDelta = (current: number, prior: number): number | null =>
  prior > 0 ? ((current - prior) / prior) * 100 : null;

export function emptySetterActivityTotals(): SetterActivityTotals {
  return {
    dials: 0, talkSeconds: 0, conversations: 0, connects3Plus: 0, meetings: 0, warmLeads: 0, connectRate: 0,
    verified: { conversations: false, meetings: false, warmLeads: false },
  };
}

export const toDayKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function countByDay(rows: ActivityRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = toDayKey(r.created_at);
    map.set(d, (map.get(d) || 0) + 1);
  }
  return map;
}

/**
 * Aggregate one setter's activity over a set of rows.
 *
 * Ops-verified manual entries win the day they cover for conversations,
 * warm leads and meetings; live sources (Close connects / app-logged rows)
 * fill the days without an entry. Connect rate stays pure Close telemetry.
 */
export function aggregateSetterActivity(
  closeRows: CloseMetricRow[],
  meetingRows: ActivityRow[],
  warmLeadRows: ActivityRow[],
  manualRows: ManualRow[],
): SetterActivityTotals {
  const t = emptySetterActivityTotals();
  let closeConnects = 0;
  for (const r of closeRows) {
    t.dials += Number(r.dials) || 0;
    t.talkSeconds += Number(r.talk_time_seconds) || 0;
    closeConnects += Number(r.connects) || 0;
    t.connects3Plus += Number(r.connects_3_plus_mins) || 0;
  }

  const manualByDay = new Map(manualRows.map((m) => [m.date, m]));
  const closeConnectsByDay = new Map<string, number>();
  for (const r of closeRows) {
    closeConnectsByDay.set(r.date, (closeConnectsByDay.get(r.date) || 0) + (Number(r.connects) || 0));
  }
  const meetingsByDay = countByDay(meetingRows);
  const warmByDay = countByDay(warmLeadRows);
  const days = new Set([
    ...manualByDay.keys(),
    ...closeConnectsByDay.keys(),
    ...meetingsByDay.keys(),
    ...warmByDay.keys(),
  ]);
  for (const day of days) {
    const m = manualByDay.get(day);
    if (m && m.conversations != null) {
      t.conversations += m.conversations;
      t.verified.conversations = true;
    } else {
      t.conversations += closeConnectsByDay.get(day) || 0;
    }
    if (m && m.warm_leads != null) {
      t.warmLeads += m.warm_leads;
      t.verified.warmLeads = true;
    } else {
      t.warmLeads += warmByDay.get(day) || 0;
    }
    if (m && m.meetings_booked_input != null) {
      t.meetings += m.meetings_booked_input;
      t.verified.meetings = true;
    } else {
      t.meetings += meetingsByDay.get(day) || 0;
    }
  }
  t.connectRate = t.dials > 0 ? (closeConnects / t.dials) * 100 : 0;
  return t;
}

// ── Per-day activity + day highlights ───────────────────────────────────────

export interface SetterDayActivity {
  /** yyyy-mm-dd day key (same keying as aggregateSetterActivity). */
  date: string;
  /** True when attendance marked this a half day. */
  half_day: boolean;
  totals: SetterActivityTotals;
}

/**
 * Per-day activity for the days a setter actually WORKED (per attendance).
 * Each day is aggregated by the same SSOT function as the window totals
 * (aggregateSetterActivity over that day's rows), so the manual-verified
 * merge and connect-rate rules apply identically per day — never a
 * re-derived formula.
 */
export function computeDailyActivity(
  closeRows: CloseMetricRow[],
  meetingRows: ActivityRow[],
  warmLeadRows: ActivityRow[],
  manualRows: ManualRow[],
  attendanceRows: Array<AttendanceStatusRow & { date: string }>,
): SetterDayActivity[] {
  const workedStatus = new Map<string, string>();
  for (const a of attendanceRows) {
    if (a.status === "present" || a.status === "late" || a.status === "half_day") {
      workedStatus.set(a.date, a.status);
    }
  }
  return [...workedStatus.keys()].sort().map((date) => ({
    date,
    half_day: workedStatus.get(date) === "half_day",
    totals: aggregateSetterActivity(
      closeRows.filter((r) => r.date === date),
      meetingRows.filter((r) => toDayKey(r.created_at) === date),
      warmLeadRows.filter((r) => toDayKey(r.created_at) === date),
      manualRows.filter((r) => r.date === date),
    ),
  }));
}

export interface DayHighlight {
  date: string;
  weekday: string;
  half_day: boolean;
  meetings_booked: number;
  dials: number;
  conversations: number;
}

export interface DayHighlights {
  strongest_day?: DayHighlight;
  least_active_day?: DayHighlight & {
    /** Present when the quiet day fits a repeating weekday tendency. */
    weekday_pattern?: string;
  };
}

/**
 * Below this many worked days, a "strongest"/"least active" day is noise —
 * highlights are omitted entirely rather than rendered misleadingly.
 */
export const MIN_WORKED_DAYS_FOR_HIGHLIGHTS = 5;

const weekdayOf = (dayKey: string): string =>
  new Date(`${dayKey}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });

const toHighlight = (d: SetterDayActivity): DayHighlight => ({
  date: d.date,
  weekday: weekdayOf(d.date),
  half_day: d.half_day,
  meetings_booked: d.totals.meetings,
  dials: d.totals.dials,
  conversations: d.totals.conversations,
});

/**
 * Deterministic day highlights over WORKED days only (non-worked days are
 * never eligible — computeDailyActivity already restricts to attendance).
 * Strongest: most meetings booked, tie-broken on dials then conversations.
 * Least active: the mirror ordering, ascending, over DIALLING days only —
 * a worked day with zero dials is treated as a non-dialling day
 * (training / admin / sync gap) and is never eligible; if no worked day in
 * the window has dials, the least-active highlight is omitted entirely.
 * The least-active framing is coaching/pattern-spotting, never a verdict —
 * when the quiet day's weekday is also the quietest repeating weekday among
 * dialling days, a tendency note is attached so the conversation can be
 * about structure, not one bad day.
 */
export function computeDayHighlights(days: SetterDayActivity[]): DayHighlights {
  if (days.length < MIN_WORKED_DAYS_FOR_HIGHLIGHTS) return {};

  const rank = (d: SetterDayActivity): [number, number, number] => [
    d.totals.meetings,
    d.totals.dials,
    d.totals.conversations,
  ];
  const compare = (a: SetterDayActivity, b: SetterDayActivity): number => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return a.date.localeCompare(b.date);
  };

  const sorted = [...days].sort(compare);
  const strongest = sorted[sorted.length - 1];

  const out: DayHighlights = {};
  // A "strongest" day with zero activity everywhere is not a highlight.
  if (strongest.totals.meetings + strongest.totals.dials + strongest.totals.conversations > 0) {
    out.strongest_day = toHighlight(strongest);
  }

  // Least-active eligibility: dialling days only (dials > 0).
  const diallingDays = sorted.filter((d) => d.totals.dials > 0);
  if (diallingDays.length === 0) return out;
  const least = diallingDays[0];

  // Weekday tendency: among weekdays with at least two DIALLING days, the
  // one with the lowest average dials. Only attached when the least-active
  // day falls on it.
  const byWeekday = new Map<string, number[]>();
  for (const d of diallingDays) {
    const wd = weekdayOf(d.date);
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), d.totals.dials]);
  }
  let quietestWeekday: string | null = null;
  let quietestAvg = Infinity;
  for (const [wd, dials] of byWeekday) {
    if (dials.length < 2) continue;
    const avg = dials.reduce((a, b) => a + b, 0) / dials.length;
    if (avg < quietestAvg) {
      quietestAvg = avg;
      quietestWeekday = wd;
    }
  }
  const leastHighlight = toHighlight(least);
  out.least_active_day =
    quietestWeekday && leastHighlight.weekday === quietestWeekday
      ? {
          ...leastHighlight,
          weekday_pattern: `${quietestWeekday}s tend to run quieter across this period`,
        }
      : leastHighlight;

  return out;
}
