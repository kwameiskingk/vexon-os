import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarRange } from "lucide-react";
import { AttendanceDayBoard } from "@/components/attendance/AttendanceDayBoard";
import { EmployeeAttendanceTracker } from "@/components/hr/EmployeeAttendanceTracker";

const OPS_COMMAND_ROLES = ["dev", "ops", "csm", "sdr_manager", "account_executive", "setter"];

export default function OpsCommandAttendance() {
  const [view, setView] = useState<"day" | "range">("day");
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Ops Command · Attendance"
          subtitle="Mark today's attendance — it feeds performance-review days worked."
          actions={
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setView((v) => (v === "day" ? "range" : "day"))}>
              {view === "day" ? <CalendarRange className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
              {view === "day" ? "Month grid" : "Day view"}
            </Button>
          }
        />
        {view === "day" ? (
          <AttendanceDayBoard scope="all" allowedRoles={OPS_COMMAND_ROLES} />
        ) : (
          <EmployeeAttendanceTracker allowedRoles={OPS_COMMAND_ROLES} />
        )}
      </PageContainer>
    </DashboardLayout>
  );
}
