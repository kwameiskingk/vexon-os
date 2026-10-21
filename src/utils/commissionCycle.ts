/**
 * Returns the start and end dates of the current commission cycle.
 * Commission cycle: 26th of previous month to 25th of current month.
 * If today is on or after the 26th, the cycle is 26th of this month to 25th of next month.
 */
export function getCommissionCycleDates(refDate: Date = new Date()): { start: Date; end: Date } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-indexed
  const day = refDate.getDate();

  if (day >= 26) {
    // Cycle: 26th of this month → 25th of next month
    return {
      start: new Date(year, month, 26),
      end: new Date(year, month + 1, 25),
    };
  } else {
    // Cycle: 26th of previous month → 25th of this month
    return {
      start: new Date(year, month - 1, 26),
      end: new Date(year, month, 25),
    };
  }
}
