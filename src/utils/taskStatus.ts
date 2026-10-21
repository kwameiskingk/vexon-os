import type { TaskInstance } from "@/hooks/useTaskInstances";
import { getCurrentHourInZone, getCurrentMinuteInZone, getDateStringInZone } from "@/utils/timezoneUtils";

const DEFAULT_TZ = "Europe/London";
const HOURLY_WINDOW_MIN = 10;

export type TaskUiStatus =
  | "done"          // already submitted/auto-ticked
  | "available"     // open and currently in the submission window
  | "overdue"       // open, window passed but same day, manual-tickable (non-hourly)
  | "missed"        // open, window passed, NOT manual-tickable (hourly only)
  | "pending";      // open, future — locked

export interface TaskUiState {
  uiStatus: TaskUiStatus;
  isHourly: boolean;
  /** Whether the user can manually toggle this task instance */
  canToggle: boolean;
  /** Optional contextual hint, e.g. "Window closes in 4m" or "Opens at 1:00 PM" */
  hint?: string;
}

/**
 * Hourly update tasks have a strict 10-minute submission window:
 *   slot=10  →  open from 10:00 to 10:10 local time, auto-locks after.
 * Other tasks (SOD, EOD, custom, etc.) can be manually ticked at any time
 * during the day.
 */
export function getTaskUiState(
  t: TaskInstance,
  tz: string = DEFAULT_TZ,
  now: Date = new Date()
): TaskUiState {
  const isHourly = !!t.link_type?.startsWith("form_hourly_");

  if (t.status === "done") {
    return { uiStatus: "done", isHourly, canToggle: !isHourly };
  }

  const todayLocal = getDateStringInZone(tz);
  const localHour = getCurrentHourInZone(tz);
  const localMinute = getCurrentMinuteInZone(tz);

  // Hourly slots — link_slot is 1..8 where 1=10AM, 2=11AM, ... 8=5PM
  if (isHourly && t.link_slot != null) {
    const slotHour = t.link_slot + 9; // 10..17
    if (t.due_date < todayLocal) {
      return { uiStatus: "missed", isHourly: true, canToggle: false, hint: "Window expired" };
    }
    if (t.due_date > todayLocal) {
      return { uiStatus: "pending", isHourly: true, canToggle: false, hint: `Opens on ${t.due_date}` };
    }
    if (localHour < slotHour) {
      return {
        uiStatus: "pending",
        isHourly: true,
        canToggle: false,
        hint: `Opens at ${formatHour(slotHour)}`,
      };
    }
    if (localHour === slotHour && localMinute < HOURLY_WINDOW_MIN) {
      return {
        uiStatus: "available",
        isHourly: true,
        canToggle: false,
        hint: `Closes in ${HOURLY_WINDOW_MIN - localMinute}m`,
      };
    }
    return { uiStatus: "missed", isHourly: true, canToggle: false, hint: "Window expired" };
  }

  // Non-hourly tasks
  if (t.due_at) {
    const dueDate = new Date(t.due_at);
    if (dueDate < now && t.due_date <= todayLocal) {
      return { uiStatus: "overdue", isHourly: false, canToggle: true };
    }
    if (t.due_date > todayLocal) {
      return { uiStatus: "pending", isHourly: false, canToggle: false, hint: `Opens on ${t.due_date}` };
    }
  } else if (t.due_date > todayLocal) {
    return { uiStatus: "pending", isHourly: false, canToggle: false };
  }

  return { uiStatus: "available", isHourly: false, canToggle: true };
}

function formatHour(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

/** slot is the 1..8 link_slot index (1=10AM..8=5PM). Range is "(hour-1) → hour". */
export function formatSlotRange(slot: number) {
  const endHour = slot + 9;
  return `${formatHour(endHour - 1)} → ${formatHour(endHour)}`;
}
