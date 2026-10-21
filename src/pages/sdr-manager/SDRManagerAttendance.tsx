import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { useState } from "react";
import { EmployeeAttendanceTracker } from "@/components/hr/EmployeeAttendanceTracker";
import { AttendanceDayBoard } from "@/components/attendance/AttendanceDayBoard";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarRange } from "lucide-react";
import { EmployeeLeaveTracker } from "@/components/hr/EmployeeLeaveTracker";
import { EODFeedbackPanel } from "@/components/sdr-manager/EODFeedbackPanel";
import { HourlyFeedbackPage } from "@/components/hourly-feedback/HourlyFeedbackPage";

import StartOfDayFeedback from "@/pages/sdr-manager/StartOfDayFeedback";
import { ObjectionReportAdmin } from "@/components/hr/ObjectionReportAdmin";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck, MessageCircle, CalendarOff, Sunrise, AlertTriangle, Clock } from "lucide-react";

export default function SDRManagerAttendance() {
  const [attendanceView, setAttendanceView] = useState<"day" | "range">("day");
  // Person-level surfaces: attendance and objections union over every held
  // department (each row carries its own person; nothing is summed).
  const { departments: managerDepartments } = useSdrManagerScope();
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Team Feedback"
          subtitle="Track attendance, leave, and team feedback across the day"
        />
        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="attendance" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-2">
              <CalendarOff className="h-4 w-4" />
              Leave Tracker
            </TabsTrigger>
            <TabsTrigger value="sod-feedback" className="gap-2">
              <Sunrise className="h-4 w-4" />
              SOD Feedback
            </TabsTrigger>
            <TabsTrigger value="hourly-feedback" className="gap-2">
              <Clock className="h-4 w-4" />
              Hourly Feedback
            </TabsTrigger>
            <TabsTrigger value="eod-feedback" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              EOD Feedback
            </TabsTrigger>
            <TabsTrigger value="objections" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Objections Reports
            </TabsTrigger>
          </TabsList>
          <TabsContent value="attendance" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAttendanceView((v) => (v === "day" ? "range" : "day"))}>
                {attendanceView === "day" ? <CalendarRange className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                {attendanceView === "day" ? "Month grid" : "Day view"}
              </Button>
            </div>
            {attendanceView === "day" ? (
              <AttendanceDayBoard scope={managerDepartments} />
            ) : (
              <EmployeeAttendanceTracker managerScope managerDepartment={managerDepartments} />
            )}
          </TabsContent>
          <TabsContent value="leave">
            <EmployeeLeaveTracker managerScope />
          </TabsContent>
          <TabsContent value="sod-feedback">
            <StartOfDayFeedback embedded />
          </TabsContent>
          <TabsContent value="hourly-feedback">
            <HourlyFeedbackPage scope="sdr_manager" embedded />
          </TabsContent>
          <TabsContent value="eod-feedback">
            <EODFeedbackPanel />
          </TabsContent>
          <TabsContent value="objections">
            <ObjectionReportAdmin scopeDepartment={managerDepartments} />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
}
