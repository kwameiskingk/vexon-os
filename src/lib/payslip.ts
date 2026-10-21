// Payslip maths and shared types (29 Sep 2026, Elena's ruling on the call):
// deductions come off the BASE SALARY only. Commission and bonuses are never
// reduced. The slip shows the base, the deductions, the base after
// deductions, then commission and bonuses, then the net payable.
//
// The edge function payslip-send has a Deno twin of computePayslip; keep
// them in step by hand.

export type PayslipCurrency = "USD" | "GBP";

export interface PayslipLine {
  label: string;
  amount: number;
}

export interface PayslipInput {
  baseSalary: number;
  commission: number;
  bonuses: PayslipLine[];
  deductions: PayslipLine[];
}

export interface PayslipTotals {
  bonusesTotal: number;
  deductionsTotal: number;
  baseAfterDeductions: number;
  grossEarnings: number;
  netPay: number;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function sumLines(lines: PayslipLine[]): number {
  return round2(lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0));
}

export function computePayslip(input: PayslipInput): PayslipTotals {
  const base = round2(Number(input.baseSalary) || 0);
  const commission = round2(Number(input.commission) || 0);
  const bonusesTotal = sumLines(input.bonuses);
  const deductionsTotal = sumLines(input.deductions);
  const baseAfterDeductions = round2(base - deductionsTotal);
  const grossEarnings = round2(base + commission + bonusesTotal);
  const netPay = round2(baseAfterDeductions + commission + bonusesTotal);
  return { bonusesTotal, deductionsTotal, baseAfterDeductions, grossEarnings, netPay };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function periodLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** Designation shown on the slip, from the setter profile title or the role. */
export function designationFor(title: string | null | undefined, roles: string[]): string {
  const t = (title || "").toLowerCase();
  if (t === "sdr") return "Sales Development Representative";
  if (t === "ae") return "Account Executive";
  if (t) return title as string;
  if (roles.includes("account_executive")) return "Account Executive";
  if (roles.includes("csm")) return "Customer Success Manager";
  if (roles.includes("sdr_manager")) return "SDR Manager";
  if (roles.includes("ops") || roles.includes("ops_assistant")) return "Operations";
  if (roles.includes("hr")) return "Human Resources";
  if (roles.includes("finance") || roles.includes("accounting")) return "Finance";
  if (roles.includes("talent_acquisition")) return "Talent Acquisition";
  if (roles.includes("gtm_engineer")) return "GTM Engineer";
  if (roles.includes("setter")) return "Sales Development Representative";
  if (roles.includes("dev")) return "Developer";
  if (roles.includes("admin")) return "Director";
  return "";
}

// Days worked for a pay cycle (2 Oct 2026, the owner's ruling after Elena's
// review): attendance is captured in bursts, so a working day with no mark
// counts as WORKED. Only an explicit absent mark, a half day, or an approved
// leave request covering the day reduces the figure. Weekends never count.
export interface CycleAttendanceRow { date: string; status: string | null }
export interface CycleLeaveRow { leave_start_date: string; return_date: string | null; leave_days_amount: number | null }
export interface DaysWorkedBreakdown {
  workingDays: number;
  present: number;   // present + late marks
  halfDays: number;
  absent: number;
  onLeave: number;   // unmarked days inside an approved leave request
  unmarked: number;  // unmarked, not on leave: counted as worked
  daysWorked: number;
}

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function daysWorkedForCycle(
  cycleStart: Date,
  cycleEnd: Date,
  attendance: CycleAttendanceRow[],
  leave: CycleLeaveRow[],
): DaysWorkedBreakdown {
  const marks = new Map<string, string>();
  for (const r of attendance) if (r.status) marks.set(r.date.slice(0, 10), r.status);

  // Leave spans as [start, end] working-day sets. A request without a return
  // date covers leave_days_amount working days from its start.
  const leaveDays = new Set<string>();
  for (const l of leave) {
    const start = new Date(`${l.leave_start_date.slice(0, 10)}T00:00:00`);
    if (l.return_date) {
      const end = new Date(`${l.return_date.slice(0, 10)}T00:00:00`);
      for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() >= 1 && d.getDay() <= 5) leaveDays.add(dayKey(d));
      }
    } else {
      let left = Math.ceil(Number(l.leave_days_amount) || 0);
      for (const d = new Date(start); left > 0; d.setDate(d.getDate() + 1)) {
        if (d.getDay() >= 1 && d.getDay() <= 5) { leaveDays.add(dayKey(d)); left -= 1; }
      }
    }
  }

  const out: DaysWorkedBreakdown = { workingDays: 0, present: 0, halfDays: 0, absent: 0, onLeave: 0, unmarked: 0, daysWorked: 0 };
  for (const d = new Date(cycleStart); d <= cycleEnd; d.setDate(d.getDate() + 1)) {
    if (d.getDay() < 1 || d.getDay() > 5) continue;
    out.workingDays += 1;
    const k = dayKey(d);
    const status = marks.get(k);
    if (status === "present" || status === "late") { out.present += 1; out.daysWorked += 1; }
    else if (status === "half_day") { out.halfDays += 1; out.daysWorked += 0.5; }
    else if (status === "absent") { out.absent += 1; }
    else if (leaveDays.has(k)) { out.onLeave += 1; }
    else { out.unmarked += 1; out.daysWorked += 1; }
  }
  out.daysWorked = Math.round(out.daysWorked * 10) / 10;
  return out;
}
