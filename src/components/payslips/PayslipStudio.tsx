// Payslip studio (29 Sep 2026, Elena's ask; replaces PaySlipper).
// Left: the form. Right: a live preview that mirrors the PDF the
// payslip-send edge function draws. Below: every slip issued, with
// download, send and delete.
//
// Rules from the call: deductions come off the BASE only (commission and
// bonuses untouched), currency per slip (USD default, GBP for the UK
// contractors), email goes out from the accounts identity, never a person.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Mail, Plus, Trash2, FilePlus2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/payroll";
import {
  computePayslip, designationFor, MONTH_NAMES, periodLabel,
  type PayslipCurrency, type PayslipLine, daysWorkedForCycle } from "@/lib/payslip";
import { functionErrorMessage } from "@/hooks/useEmployeeOnboarding";
import { LEGAL_ENTITY } from "@/lib/legalEntity";

/** Pay cycle printed on a "<Month> <Year>" slip: 26th of the month before to the 25th (commissionCycle.ts). */
function payCycleFor(month: number, year: number) {
  return { start: new Date(year, month - 2, 26), end: new Date(year, month - 1, 25) };
}

const NON_STAFF_ROLES = new Set(["client", "partner", "trialist"]);

interface StaffOption {
  userId: string;
  fullName: string;
  email: string;
  designation: string;
  baseSalary: number;
  currency: PayslipCurrency;
  setterProfileId: string | null;
  /** false = former staff: offboarded profile or inactive setter profile. */
  active: boolean;
  leaveAllowanceDays: number | null;
}

interface PayslipRecord {
  id: string;
  user_id: string | null;
  employee_id: string | null;
  month: number;
  year: number;
  employee_name: string | null;
  employee_email: string | null;
  designation: string | null;
  currency: PayslipCurrency;
  pay_date: string | null;
  base_salary: number;
  commission: number;
  bonuses: PayslipLine[] | null;
  deductions: PayslipLine[] | null;
  net_pay: number;
  notes: string | null;
  days_worked: number | null;
  leave_balance: number | null;
  status: "draft" | "sent";
  sent_at: string | null;
  sent_to: string | null;
  payslip_no: string | null;
  created_at: string;
}

/** A line as typed: amount stays text until save so decimals survive typing. */
interface FormLine {
  label: string;
  amount: string;
}

interface FormState {
  userId: string;
  employeeName: string;
  employeeEmail: string;
  designation: string;
  month: number;
  year: number;
  payDate: string;
  currency: PayslipCurrency;
  baseSalary: string;
  commission: string;
  bonuses: FormLine[];
  deductions: FormLine[];
  notes: string;
  daysWorked: string;
  leaveBalance: string;
}

const toLines = (ls: FormLine[]): PayslipLine[] =>
  ls.map((l) => ({ label: l.label, amount: num(l.amount) }));
const fromLines = (ls: PayslipLine[] | null | undefined): FormLine[] =>
  (Array.isArray(ls) ? ls : []).map((l) => ({ label: l.label ?? "", amount: l.amount ? String(l.amount) : "" }));

function defaultForm(): FormState {
  const now = new Date();
  return {
    userId: "",
    employeeName: "",
    employeeEmail: "",
    designation: "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    payDate: format(now, "yyyy-MM-dd"),
    currency: "USD",
    baseSalary: "",
    commission: "",
    bonuses: [],
    deductions: [],
    notes: "",
    daysWorked: "",
    leaveBalance: "",
  };
}

const num = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function downloadBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function callPayslipFunction(action: "render" | "send", payslipId: string) {
  const { data, error } = await supabase.functions.invoke("payslip-send", {
    method: "POST",
    body: { action, payslip_id: payslipId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Payslip service failed"));
  if (data?.error) throw new Error(data.error as string);
  return data as { ok: boolean; filename: string; pdf_base64?: string; sent_to?: string };
}

export function PayslipStudio() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<PayslipRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PayslipRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Former staff still need a final payslip (the owner, 29 Sep), so they are one
  // toggle away rather than hidden. Default is current staff.
  const [staffFilter, setStaffFilter] = useState<"active" | "former">("active");

  // Everyone with a staff role, current and former. profiles.offboarded_at is
  // the platform-wide leaver flag; setters_profiles.active covers the SDRs and
  // AEs who were marked inactive without an offboarding record.
  const { data: staff = [] } = useQuery({
    queryKey: ["payslip-staff-options"],
    queryFn: async (): Promise<StaffOption[]> => {
      const [profilesRes, rolesRes, settersRes, aeRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, base_salary, offboarded_at, job_title, leave_allowance_days" as "id"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("setters_profiles").select("id, user_id, base_salary, currency, title, active, is_test_account"),
        supabase.from("ae_compensation").select("user_id, base_salary"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const rolesBy = new Map<string, string[]>();
      for (const r of rolesRes.data ?? []) {
        rolesBy.set(r.user_id, [...(rolesBy.get(r.user_id) ?? []), String(r.role)]);
      }
      const setterBy = new Map<string, NonNullable<typeof settersRes.data>[number]>();
      for (const s of settersRes.data ?? []) if (s.user_id) setterBy.set(s.user_id, s);
      const aeBy = new Map<string, number>();
      for (const a of aeRes.data ?? []) if (a.user_id) aeBy.set(a.user_id, Number(a.base_salary) || 0);

      const out: StaffOption[] = [];
      type ProfileRow = { id: string; full_name: string | null; email: string | null; base_salary: number | null; offboarded_at: string | null; job_title: string | null; leave_allowance_days: number | null };
      for (const p of (profilesRes.data ?? []) as unknown as ProfileRow[]) {
        const roles = rolesBy.get(p.id) ?? [];
        if (roles.length === 0 || roles.every((r) => NON_STAFF_ROLES.has(r))) continue;
        const sp = setterBy.get(p.id);
        if (sp?.is_test_account) continue;
        const base = (sp && Number(sp.base_salary) > 0 ? Number(sp.base_salary) : 0)
          || aeBy.get(p.id) || Number(p.base_salary) || 0;
        out.push({
          userId: p.id,
          fullName: (p.full_name || p.email || "").trim(),
          email: p.email || "",
          // Job title from the Employee Hub wins; the role-based label is only a fallback.
          designation: p.job_title?.trim() || designationFor(sp?.title ?? null, roles),
          baseSalary: base,
          currency: (sp?.currency === "GBP" ? "GBP" : "USD"),
          setterProfileId: sp?.id ?? null,
          active: !p.offboarded_at && sp?.active !== false,
          leaveAllowanceDays: p.leave_allowance_days != null ? Number(p.leave_allowance_days) : null,
        });
      }
      return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
  });

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["employee-payslips-studio"],
    queryFn: async (): Promise<PayslipRecord[]> => {
      const { data, error } = await supabase
        .from("employee_payslips")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PayslipRecord[];
    },
  });

  const visibleStaff = useMemo(
    () => staff.filter((s) => (staffFilter === "active" ? s.active : !s.active)),
    [staff, staffFilter],
  );

  // Days worked this pay cycle and leave balance (allowance minus approved
  // holiday this year), prefilled per employee and period; Elena can overtype
  // either. 2 Oct: a working day with no attendance mark counts as worked
  // (see daysWorkedForCycle); overtyping the slip does NOT rewrite attendance.
  const cycle = payCycleFor(form.month, form.year);
  const cycleStart = format(cycle.start, "yyyy-MM-dd");
  const cycleEnd = format(cycle.end, "yyyy-MM-dd");
  const selectedStaff = staff.find((s) => s.userId === form.userId);
  const { data: prefill } = useQuery({
    queryKey: ["payslip-prefill", form.userId, cycleStart, cycleEnd],
    enabled: !!form.userId,
    queryFn: async () => {
      const [att, leave, cycleLeave] = await Promise.all([
        supabase.from("employee_attendance").select("date, status").eq("employee_id", form.userId).gte("date", cycleStart).lte("date", cycleEnd),
        supabase.from("employee_leave_requests").select("leave_days_amount, reason, status, leave_start_date")
          .eq("user_id", form.userId).eq("status", "approved").eq("reason", "holiday")
          .gte("leave_start_date", `${form.year}-01-01`).lte("leave_start_date", `${form.year}-12-31`),
        // Any approved leave (holiday, sick, other) that starts before the
        // cycle ends; the helper clips it to the cycle's working days.
        supabase.from("employee_leave_requests").select("leave_start_date, return_date, leave_days_amount")
          .eq("user_id", form.userId).eq("status", "approved").lte("leave_start_date", cycleEnd),
      ]);
      const breakdown = daysWorkedForCycle(cycle.start, cycle.end,
        (att.data ?? []) as { date: string; status: string | null }[],
        (cycleLeave.data ?? []) as { leave_start_date: string; return_date: string | null; leave_days_amount: number | null }[]);
      const holidayTaken = (leave.data ?? []).reduce((a, r) => a + (Number(r.leave_days_amount) || 0), 0);
      return { breakdown, holidayTaken, attendanceRows: att.data?.length ?? 0 };
    },
  });
  const leaveBalanceComputed = selectedStaff?.leaveAllowanceDays != null && prefill
    ? Math.round((selectedStaff.leaveAllowanceDays - prefill.holidayTaken) * 10) / 10
    : null;
  const prefillDays = prefill ? String(prefill.breakdown.daysWorked) : null;
  const prefillLeave = leaveBalanceComputed != null ? String(leaveBalanceComputed) : null;
  useEffect(() => {
    // Only for a fresh slip: an opened draft keeps whatever was saved on it.
    if (editingId || !prefill) return;
    setForm((f) => ({
      ...f,
      daysWorked: prefillDays ?? f.daysWorked,
      leaveBalance: prefillLeave ?? f.leaveBalance,
    }));
  }, [editingId, prefill, prefillDays, prefillLeave]);

  const totals = useMemo(() => computePayslip({
    baseSalary: num(form.baseSalary),
    commission: num(form.commission),
    bonuses: toLines(form.bonuses),
    deductions: toLines(form.deductions),
  }), [form.baseSalary, form.commission, form.bonuses, form.deductions]);

  const selectStaff = (userId: string) => {
    const s = staff.find((x) => x.userId === userId);
    if (!s) return;
    setForm((f) => ({
      ...f,
      userId,
      employeeName: s.fullName,
      employeeEmail: s.email,
      designation: s.designation,
      currency: s.currency,
      baseSalary: s.baseSalary ? String(s.baseSalary) : f.baseSalary,
    }));
  };

  const setLine = (kind: "bonuses" | "deductions", idx: number, patch: Partial<FormLine>) =>
    setForm((f) => ({ ...f, [kind]: f[kind].map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  const addLine = (kind: "bonuses" | "deductions") =>
    setForm((f) => ({ ...f, [kind]: [...f[kind], { label: "", amount: "" }] }));
  const removeLine = (kind: "bonuses" | "deductions", idx: number) =>
    setForm((f) => ({ ...f, [kind]: f[kind].filter((_, i) => i !== idx) }));

  const loadIntoForm = (p: PayslipRecord) => {
    setEditingId(p.id);
    setForm({
      userId: p.user_id ?? "",
      employeeName: p.employee_name ?? "",
      employeeEmail: p.employee_email ?? "",
      designation: p.designation ?? "",
      month: p.month,
      year: p.year,
      payDate: p.pay_date ?? format(new Date(), "yyyy-MM-dd"),
      currency: p.currency === "GBP" ? "GBP" : "USD",
      baseSalary: String(p.base_salary ?? ""),
      commission: p.commission ? String(p.commission) : "",
      bonuses: fromLines(p.bonuses),
      deductions: fromLines(p.deductions),
      notes: p.notes ?? "",
      daysWorked: p.days_worked != null ? String(p.days_worked) : "",
      leaveBalance: p.leave_balance != null ? String(p.leave_balance) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm());
  };

  const validate = (): string | null => {
    if (!form.employeeName.trim()) return "Pick an employee";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.employeeEmail.trim())) return "Employee email looks wrong";
    if (num(form.baseSalary) < 0) return "Base salary cannot be negative";
    if (form.bonuses.some((b) => !b.label.trim())) return "Every bonus needs a label";
    if (form.deductions.some((d) => !d.label.trim())) return "Every deduction needs a label";
    return null;
  };

  // Save the row (insert or update). Returns the id.
  const save = useMutation({
    mutationFn: async (): Promise<string> => {
      const problem = validate();
      if (problem) throw new Error(problem);
      const staffRow = staff.find((s) => s.userId === form.userId);
      const cleanLines = (ls: FormLine[]) =>
        ls.map((l) => ({ label: l.label.trim(), amount: Math.round(num(l.amount) * 100) / 100 }));
      const payload = {
        user_id: form.userId || null,
        employee_id: staffRow?.setterProfileId ?? null,
        month: form.month,
        year: form.year,
        employee_name: form.employeeName.trim(),
        employee_email: form.employeeEmail.trim().toLowerCase(),
        designation: form.designation.trim() || null,
        currency: form.currency,
        pay_date: form.payDate || null,
        base_salary: num(form.baseSalary),
        commission: num(form.commission),
        bonuses: cleanLines(form.bonuses),
        deductions: cleanLines(form.deductions),
        bonuses_total: totals.bonusesTotal,
        deductions_total: totals.deductionsTotal,
        net_pay: totals.netPay,
        amount: totals.netPay,
        notes: form.notes.trim() || null,
        days_worked: form.daysWorked.trim() === "" ? null : num(form.daysWorked),
        leave_balance: form.leaveBalance.trim() === "" ? null : num(form.leaveBalance),
      };
      if (editingId) {
        const { error } = await supabase.from("employee_payslips").update(payload as never).eq("id", editingId);
        if (error) throw error;
        return editingId;
      }
      const { data, error } = await supabase
        .from("employee_payslips")
        .insert({ ...payload, created_by: user?.id ?? null } as never)
        .select("id")
        .single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      setEditingId(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-payslips-studio"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the payslip"),
  });

  const handleSave = async () => {
    try {
      await save.mutateAsync();
      toast.success("Payslip saved");
    } catch { /* toasted in onError */ }
  };

  const handleDownload = async (id?: string) => {
    setBusy(id ?? "form");
    try {
      const targetId = id ?? (await save.mutateAsync());
      const res = await callPayslipFunction("render", targetId);
      if (!res.pdf_base64) throw new Error("No PDF returned");
      downloadBase64Pdf(res.pdf_base64, res.filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the PDF");
    } finally {
      setBusy(null);
    }
  };

  const handleSendFromForm = async () => {
    try {
      const id = await save.mutateAsync();
      const row = payslips.find((p) => p.id === id);
      setConfirmSend(row ?? {
        id, user_id: form.userId || null, employee_id: null, month: form.month, year: form.year,
        employee_name: form.employeeName, employee_email: form.employeeEmail, designation: form.designation,
        currency: form.currency, pay_date: form.payDate, base_salary: num(form.baseSalary), commission: num(form.commission),
        bonuses: toLines(form.bonuses), deductions: toLines(form.deductions), net_pay: totals.netPay, notes: form.notes,
        days_worked: form.daysWorked.trim() === "" ? null : num(form.daysWorked), leave_balance: form.leaveBalance.trim() === "" ? null : num(form.leaveBalance),
        status: "draft", sent_at: null, sent_to: null, payslip_no: null, created_at: new Date().toISOString(),
      });
    } catch { /* toasted */ }
  };

  const doSend = async (p: PayslipRecord) => {
    setBusy(p.id);
    try {
      const res = await callPayslipFunction("send", p.id);
      toast.success(`Payslip emailed to ${res.sent_to}`);
      queryClient.invalidateQueries({ queryKey: ["employee-payslips-studio"] });
      if (editingId === p.id) resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the payslip");
    } finally {
      setBusy(null);
      setConfirmSend(null);
    }
  };

  const doDelete = async (p: PayslipRecord) => {
    setBusy(p.id);
    try {
      const { error } = await supabase.from("employee_payslips").delete().eq("id", p.id);
      if (error) throw error;
      toast.success("Payslip deleted");
      queryClient.invalidateQueries({ queryKey: ["employee-payslips-studio"] });
      if (editingId === p.id) resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the payslip");
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const money = (n: number) => formatMoney(n, form.currency);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Form */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{editingId ? "Edit payslip" : "New payslip"}</CardTitle>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <FilePlus2 className="h-4 w-4 mr-1" /> Start a new one
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <Label>Employee</Label>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={staffFilter}
                    onValueChange={(v) => { if (v === "active" || v === "former") setStaffFilter(v); }}
                    aria-label="Show current or former employees"
                  >
                    <ToggleGroupItem value="active" className="text-xs px-3">Current</ToggleGroupItem>
                    <ToggleGroupItem value="former" className="text-xs px-3">Former</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <Select value={visibleStaff.some((s) => s.userId === form.userId) ? form.userId : ""} onValueChange={selectStaff}>
                  <SelectTrigger><SelectValue placeholder={staffFilter === "active" ? "Pick an employee" : "Pick a former employee"} /></SelectTrigger>
                  <SelectContent>
                    {visibleStaff.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Nobody in this list</div>
                    )}
                    {visibleStaff.map((s) => (
                      <SelectItem key={s.userId} value={s.userId}>
                        {s.fullName} <span className="text-muted-foreground">· {s.email}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {staffFilter === "former" && (
                  <p className="mt-1 text-xs text-muted-foreground">Former staff: this is usually their final payslip. Check the email still reaches them.</p>
                )}
              </div>
              <div>
                <Label>Name on payslip</Label>
                <Input value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} />
              </div>
              <div>
                <Label>Email to send to</Label>
                <Input type="email" value={form.employeeEmail} onChange={(e) => setForm({ ...form, employeeEmail: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Designation</Label>
                <Input value={form.designation} placeholder="e.g. Sales Development Representative"
                  onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div>
                <Label>Month</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Select value={String(form.year)} onValueChange={(v) => setForm({ ...form, year: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pay date</Label>
                <Input type="date" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as PayslipCurrency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Base salary</Label>
                <Input inputMode="decimal" value={form.baseSalary} placeholder="0.00"
                  onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} />
              </div>
              <div>
                <Label>Commission</Label>
                <Input inputMode="decimal" value={form.commission} placeholder="0.00"
                  onChange={(e) => setForm({ ...form, commission: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Days worked</Label>
                <Input inputMode="decimal" value={form.daysWorked} placeholder="e.g. 21"
                  onChange={(e) => setForm({ ...form, daysWorked: e.target.value.replace(/[^0-9.]/g, "") })} />
                <p className="text-xs text-muted-foreground mt-1">
                  {format(cycle.start, "d MMM")} to {format(cycle.end, "d MMM")}, Monday to Friday. Half days count as 0.5. Unmarked days count as worked.
                </p>
                {form.userId && prefill && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {prefill.breakdown.workingDays} working days: {prefill.breakdown.present} marked present, {prefill.breakdown.halfDays} half,{" "}
                    {prefill.breakdown.absent} absent, {prefill.breakdown.onLeave} on approved leave, {prefill.breakdown.unmarked} unmarked.
                    {prefill.attendanceRows === 0 && " No attendance captured for this cycle."}
                  </p>
                )}
              </div>
              <div>
                <Label>Leave balance (days)</Label>
                <Input inputMode="decimal" value={form.leaveBalance} placeholder="e.g. 12"
                  onChange={(e) => setForm({ ...form, leaveBalance: e.target.value.replace(/[^0-9.-]/g, "") })} />
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedStaff && selectedStaff.leaveAllowanceDays == null
                    ? "Set the annual allowance on the employee's profile in the Employee Hub to prefill this."
                    : `Allowance minus approved holiday taken in ${form.year}.`}
                </p>
              </div>
            </div>

            <LineEditor
              title="Bonuses"
              hint="Added on top. Never reduced by deductions."
              lines={form.bonuses}
              onChange={(i, patch) => setLine("bonuses", i, patch)}
              onAdd={() => addLine("bonuses")}
              onRemove={(i) => removeLine("bonuses", i)}
            />
            <LineEditor
              title="Deductions"
              hint="Taken from the base salary only, e.g. unpaid days off."
              lines={form.deductions}
              onChange={(i, patch) => setLine("deductions", i, patch)}
              onAdd={() => addLine("deductions")}
              onRemove={(i) => removeLine("deductions", i)}
            />

            <div>
              <Label>Notes (printed on the slip)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save draft
              </Button>
              <Button variant="outline" onClick={() => handleDownload()} disabled={busy === "form" || save.isPending}>
                {busy === "form" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Download PDF
              </Button>
              <Button onClick={handleSendFromForm} disabled={save.isPending}>
                <Mail className="h-4 w-4 mr-1" /> Send to employee
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
          <CardContent>
            {/* 6 Oct (Marcus, via Elena): mirrors the official grid the PDF
                draws in supabase/functions/_shared/payslip-pdf.ts. */}
            <div className="bg-white p-4 text-[12px] text-[#0f0f11] shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <img src="/brand/vexon-logo-dark.png" alt="Vexon OS" className="h-5 w-auto" />
                <div className="text-right">
                  <div className="text-base font-bold">PAYSLIP</div>
                  <div className="text-[11px] text-[#5f5f66]">{periodLabel(form.month, form.year)}</div>
                </div>
              </div>
              <div className="border border-[#1a1a1d]">
                <GridRow cells={[
                  { k: "EMPLOYER", v: LEGAL_ENTITY.name, w: "36%" },
                  { k: "EMPLOYEE NAME", v: form.employeeName, w: "42%" },
                  { k: "PAY DATE", v: form.payDate ? format(new Date(form.payDate + "T00:00:00"), "dd/MM/yyyy") : "", w: "22%" },
                ]} />
                <GridRow cells={[
                  { k: "DEPARTMENT", v: form.designation, w: "36%" },
                  { k: "PAYSLIP NO.", v: editingId ? (payslips.find((p) => p.id === editingId)?.payslip_no ?? "on save") : "on save", w: "21%" },
                  { k: "PAY PERIOD", v: periodLabel(form.month, form.year), w: "21%" },
                  { k: "CURRENCY", v: form.currency, w: "22%" },
                ]} />
                <div className="grid grid-cols-[27%_38%_35%] bg-[#1a1a1d] text-center text-[9px] font-bold tracking-wide text-white">
                  <div className="py-0.5">EMPLOYEE DETAILS</div><div className="py-0.5">EARNINGS</div><div className="py-0.5">DEDUCTIONS</div>
                </div>
                <div className="grid min-h-[150px] grid-cols-[27%_38%_35%] bg-[#EEEDF4]">
                  <div className="space-y-2 border-r border-[#1a1a1d] p-2">
                    <PreviewRow k="EMAIL" v={form.employeeEmail} />
                    {form.daysWorked.trim() !== "" && <PreviewRow k="DAYS WORKED" v={form.daysWorked} />}
                    {form.leaveBalance.trim() !== "" && <PreviewRow k="LEAVE BALANCE" v={`${form.leaveBalance} days`} />}
                  </div>
                  <div className="border-r border-[#1a1a1d] p-2">
                    <PreviewLine k="Basic pay" v={money(num(form.baseSalary))} />
                    {num(form.commission) > 0 && <PreviewLine k="Commission" v={money(num(form.commission))} />}
                    {form.bonuses.map((b, i) => <PreviewLine key={i} k={b.label || "Bonus"} v={money(num(b.amount))} />)}
                  </div>
                  <div className="p-2">
                    {form.deductions.length === 0 && <div className="text-[#5f5f66]">None this period</div>}
                    {form.deductions.map((d, i) => <PreviewLine key={i} k={d.label || "Deduction"} v={money(num(d.amount))} />)}
                    {totals.deductionsTotal > 0 && (
                      <>
                        <div className="pt-1 text-[9px] text-[#5f5f66]">Taken from basic pay only.</div>
                        <PreviewLine k="Basic pay after deductions" v={money(totals.baseAfterDeductions)} strong />
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 border-t border-[#1a1a1d]">
                  {[
                    { k: "TOTAL EARNINGS", v: money(totals.grossEarnings) },
                    { k: "TOTAL DEDUCTIONS", v: money(totals.deductionsTotal) },
                    { k: "NET PAY", v: money(totals.netPay), strong: true },
                  ].map((c) => (
                    <div key={c.k} className="grid grid-cols-2">
                      <div className="flex items-center justify-center bg-[#1a1a1d] px-1 py-2 text-center text-[9px] font-bold text-white">{c.k}</div>
                      <div className={`flex items-center justify-center py-2 ${c.strong ? "text-[13px] font-bold" : ""}`}>{c.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-1 text-right text-[10px] text-[#5f5f66]">
                {totals.deductionsTotal > 0
                  ? "Net pay = basic pay after deductions + commission + bonuses"
                  : "Net pay = basic pay + commission + bonuses"}
              </div>
              {form.notes.trim() && (
                <div className="mt-3 border border-[#1a1a1d]">
                  <div className="bg-[#1a1a1d] px-2 py-0.5 text-[9px] font-bold text-white">NOTES</div>
                  <div className="bg-[#EEEDF4] p-2">{form.notes}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Issued payslips</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : payslips.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing issued yet. The first one you save will appear here.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Net pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id} className={editingId === p.id ? "bg-muted/40" : undefined}>
                    <TableCell className="font-mono text-xs">{p.payslip_no ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p.employee_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.employee_email ?? ""}</div>
                    </TableCell>
                    <TableCell>{periodLabel(p.month, p.year)}</TableCell>
                    <TableCell className="text-right">{formatMoney(Number(p.net_pay) || 0, p.currency)}</TableCell>
                    <TableCell>
                      {p.status === "sent" ? (
                        <Badge variant="secondary">Sent {p.sent_at ? format(new Date(p.sent_at), "d MMM") : ""}</Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => loadIntoForm(p)}>Open</Button>
                        <Button variant="ghost" size="icon" title="Download PDF" disabled={busy === p.id} onClick={() => handleDownload(p.id)}>
                          {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" title={p.status === "sent" ? "Send again" : "Send"} disabled={busy === p.id} onClick={() => setConfirmSend(p)}>
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete" disabled={busy === p.id} onClick={() => setConfirmDelete(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmSend} onOpenChange={(o) => !o && setConfirmSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email this payslip?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSend && (
                <>
                  {periodLabel(confirmSend.month, confirmSend.year)} for <strong>{confirmSend.employee_name}</strong>, net{" "}
                  <strong>{formatMoney(Number(confirmSend.net_pay) || 0, confirmSend.currency)}</strong>, will go to{" "}
                  <strong>{confirmSend.employee_email}</strong> from the Meridian accounts address with the PDF attached.
                  {confirmSend.status === "sent" && " This payslip was already sent once."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmSend && doSend(confirmSend)}>Send it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payslip?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && `${periodLabel(confirmDelete.month, confirmDelete.year)} for ${confirmDelete.employee_name}. `}
              The record is removed from Vexon OS. An email that was already sent cannot be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && doDelete(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GridRow({ cells }: { cells: { k: string; v: string; w: string }[] }) {
  return (
    <>
      <div className="flex bg-[#1a1a1d] text-center text-[9px] font-bold tracking-wide text-white">
        {cells.map((c) => <div key={c.k} style={{ width: c.w }} className="py-0.5">{c.k}</div>)}
      </div>
      <div className="flex bg-[#EEEDF4] text-center">
        {cells.map((c, i) => (
          <div key={c.k} style={{ width: c.w }} className={`truncate px-1 py-1.5 ${i > 0 ? "border-l border-[#1a1a1d]" : ""}`}>{c.v || "—"}</div>
        ))}
      </div>
    </>
  );
}

function PreviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold text-[#5f5f66]">{k}</div>
      <div className="break-words">{v || "—"}</div>
    </div>
  );
}

function PreviewLine({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${strong ? "font-bold" : ""}`}>
      <span className="truncate pr-2">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function LineEditor({
  title, hint, lines, onChange, onAdd, onRemove,
}: {
  title: string;
  hint: string;
  lines: FormLine[];
  onChange: (idx: number, patch: Partial<FormLine>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>{title}</Label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input className="flex-1" placeholder="Label, e.g. 2 unpaid days" value={l.label}
            onChange={(e) => onChange(i, { label: e.target.value })} />
          <Input className="w-32" inputMode="decimal" placeholder="0.00" value={l.amount}
            onChange={(e) => onChange(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(i)} title="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
