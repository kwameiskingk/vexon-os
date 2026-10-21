// HR · Overview (rebuilt 14 Oct 2026, the owner). The old page counted active
// setter rows and called it headcount, so it said 7 when the company had 9.
// This one uses the one leaver rule (lib/staffStatus): everyone with a staff
// role whose profile has no offboarded_at, test accounts excluded. The other
// tiles are things HR acts on today, not metrics: who started and left this
// month, who is away, leave waiting for a decision, candidates in the
// pipeline. Every tile opens the page that handles it.

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, Row, RowList, RowName, StatStrip } from "@/components/ui-v2";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentStaff } from "@/lib/staffStatus";
import { FLOW_STAGES } from "@/lib/hiringPipeline";
import { format, startOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, UserMinus, CalendarOff, Inbox, UserSearch,
  Briefcase, Receipt, FileText, UserCheck, UserCog,
} from "lucide-react";

const STAFF_ROLES_EXCLUDED = new Set(["client", "partner", "trialist"]);

type StaffRow = {
  id: string;
  full_name: string | null;
  offboarded_at: string | null;
  start_date: string | null;
  created_at: string;
  role: string;
  department: string;
  is_test: boolean;
};

function departmentFor(role: string, setterDepartment: string | null | undefined): string {
  if (setterDepartment === "fulfilment" || setterDepartment === "acquisition") return setterDepartment;
  if (role === "hr") return "hr";
  if (role === "accounting" || role === "finance") return "accounting";
  if (role === "account_executive") return "sales";
  return "operations";
}

const DEPARTMENT_LABEL: Record<string, string> = {
  fulfilment: "Fulfilment",
  acquisition: "Acquisition",
  operations: "Operations",
  sales: "Sales",
  hr: "HR",
  accounting: "Accounting",
};

export default function HROverview() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["hr-overview", format(new Date(), "yyyy-MM-dd")],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

      // 1. Everyone with a staff role.
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;
      const roleByUser = new Map<string, string>();
      for (const r of roleRows ?? []) {
        if (STAFF_ROLES_EXCLUDED.has(r.role)) continue;
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      }
      const ids = [...roleByUser.keys()];
      if (ids.length === 0) {
        return { staff: [] as StaffRow[], absent: 0, late: 0, onLeave: 0, pendingLeave: 0, pipeline: 0, screening: 0 };
      }

      const [profilesRes, settersRes, attendanceRes, leaveTodayRes, pendingLeaveRes, candidatesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, offboarded_at, start_date, created_at").in("id", ids),
        supabase.from("setters_profiles").select("user_id, department, is_test_account, start_date").in("user_id", ids),
        supabase.from("employee_attendance").select("employee_id, status").eq("date", today),
        supabase.from("employee_leave_requests").select("id", { count: "exact", head: true })
          .eq("status", "approved").lte("start_date", today).gte("end_date", today),
        supabase.from("employee_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("candidates").select("stage_key"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const setterByUser = new Map((settersRes.data ?? []).map((s) => [s.user_id, s]));
      const staff: StaffRow[] = (profilesRes.data ?? []).map((p) => {
        const role = roleByUser.get(p.id) ?? "unknown";
        const setter = setterByUser.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          offboarded_at: p.offboarded_at,
          start_date: setter?.start_date ?? p.start_date ?? null,
          created_at: p.created_at,
          role,
          department: departmentFor(role, setter?.department),
          is_test: setter?.is_test_account === true,
        };
      });

      const attendance = attendanceRes.data ?? [];
      const activeStageKeys = new Set(
        FLOW_STAGES.filter((s) => s.key !== "screening" && s.key !== "hired").map((s) => s.key),
      );
      const candidates = candidatesRes.data ?? [];

      return {
        staff,
        monthStart,
        absent: attendance.filter((a) => a.status === "absent").length,
        late: attendance.filter((a) => a.status === "late").length,
        onLeave: leaveTodayRes.count ?? 0,
        pendingLeave: pendingLeaveRes.count ?? 0,
        pipeline: candidates.filter((c) => c.stage_key && activeStageKeys.has(c.stage_key as never)).length,
        screening: candidates.filter((c) => c.stage_key === "screening").length,
      };
    },
  });

  const staff = (data?.staff ?? []).filter((s) => !s.is_test);
  const current = staff.filter(isCurrentStaff);
  const monthStart = data?.monthStart ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const startedThisMonth = current.filter((s) => (s.start_date ?? s.created_at.slice(0, 10)) >= monthStart);
  const leftThisMonth = staff.filter((s) => s.offboarded_at && s.offboarded_at.slice(0, 10) >= monthStart);
  const byDepartment = current.reduce<Record<string, number>>((acc, s) => {
    acc[s.department] = (acc[s.department] ?? 0) + 1;
    return acc;
  }, {});
  const departmentLine = Object.entries(byDepartment)
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${n} ${DEPARTMENT_LABEL[d] ?? d}`)
    .join(" · ");
  const awayToday = (data?.absent ?? 0) + (data?.late ?? 0) + (data?.onLeave ?? 0);
  const awayLine = [
    data?.absent ? `${data.absent} absent` : null,
    data?.late ? `${data.late} late` : null,
    data?.onLeave ? `${data.onLeave} on leave` : null,
  ].filter(Boolean).join(", ") || "Nobody marked away";

  const tiles = [
    { title: "Headcount", value: current.length, note: departmentLine || "Current staff", icon: Users, to: "/admin/hr/employees" },
    { title: "Started this month", value: startedThisMonth.length, note: startedThisMonth.map((s) => s.full_name).filter(Boolean).join(", ") || "No new starters", icon: UserPlus, to: "/admin/hr/onboarding" },
    { title: "Left this month", value: leftThisMonth.length, note: leftThisMonth.map((s) => s.full_name).filter(Boolean).join(", ") || "Nobody left", icon: UserMinus, to: "/admin/hr/offboarding" },
    { title: "Away today", value: awayToday, note: awayLine, icon: CalendarOff, to: "/admin/hr/attendance" },
    { title: "Leave requests waiting", value: data?.pendingLeave ?? 0, note: "Pending a decision", icon: Inbox, to: "/admin/hr/attendance" },
    { title: "Candidates in pipeline", value: data?.pipeline ?? 0, note: data?.screening ? `${data.screening} more still at screening` : "Trial day through to offer", icon: UserSearch, to: "/admin/hr/hiring" },
  ];

  const actions = [
    { label: "Hiring Management", icon: UserSearch, to: "/admin/hr/hiring" },
    { label: "Employee Hub", icon: Users, to: "/admin/hr/employees" },
    { label: "Employee Onboarding", icon: Briefcase, to: "/admin/hr/onboarding" },
    { label: "Employee Offboarding", icon: UserCog, to: "/admin/hr/offboarding" },
    { label: "Payslips", icon: Receipt, to: "/admin/hr/payslips" },
    { label: "Document Storage", icon: FileText, to: "/admin/hr/documents" },
    { label: "User Management", icon: UserCheck, to: "/admin/hr/user-management" },
  ];

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="HR Overview" subtitle="Who is with us, who is away, and what needs a decision today" />
        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : (
            <>
              <StatStrip stats={tiles.slice(0, 3).map((tile) => ({ label: tile.title, value: tile.value, caption: tile.note }))} />
              <StatStrip stats={tiles.slice(3).map((tile) => ({ label: tile.title, value: tile.value, caption: tile.note }))} />
            </>
          )}

          <Panel title="Go to">
            <RowList columns="1fr auto">
              {actions.map((a) => (
                <Row key={a.to} onClick={() => navigate(a.to)}>
                  <RowName primary={a.label} secondary={tiles.find((t) => t.to === a.to)?.note} />
                  <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
                </Row>
              ))}
            </RowList>
          </Panel>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
