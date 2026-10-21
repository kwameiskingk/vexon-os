import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeAttendanceTracker } from "@/components/hr/EmployeeAttendanceTracker";
import { EmployeeLeaveTracker } from "@/components/hr/EmployeeLeaveTracker";
import { EODSubmissionsCard } from "@/components/hr/EODSubmissionsCard";
import { ObjectionReportAdmin } from "@/components/hr/ObjectionReportAdmin";
import { HourlyFeedbackPage } from "@/components/hourly-feedback/HourlyFeedbackPage";
import StartOfDayFeedback from "@/pages/sdr-manager/StartOfDayFeedback";

export default function HRAttendance() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Team Feedback"
          subtitle="Track attendance, leave, and team feedback across the day"
        />
        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leave">Leave Tracker</TabsTrigger>
            <TabsTrigger value="sod-feedback">SOD Feedback</TabsTrigger>
            <TabsTrigger value="hourly-feedback">Hourly Feedback</TabsTrigger>
            <TabsTrigger value="eod-submissions">EOD Submissions</TabsTrigger>
            <TabsTrigger value="objections">Objections Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="attendance">
            <EmployeeAttendanceTracker />
          </TabsContent>
          <TabsContent value="leave">
            <EmployeeLeaveTracker />
          </TabsContent>
          <TabsContent value="sod-feedback">
            <StartOfDayFeedback embedded scope="operations" />
          </TabsContent>
          <TabsContent value="hourly-feedback">
            <HourlyFeedbackPage scope="operations" embedded />
          </TabsContent>
          <TabsContent value="eod-submissions">
            <EODSubmissionsCard />
          </TabsContent>
          <TabsContent value="objections">
            <ObjectionReportAdmin />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
}
