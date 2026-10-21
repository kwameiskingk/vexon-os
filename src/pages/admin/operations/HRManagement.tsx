import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Calendar, FileText } from "lucide-react";
import { EmployeeAttendanceTracker } from "@/components/hr/EmployeeAttendanceTracker";
import { EODSubmissionsCard } from "@/components/hr/EODSubmissionsCard";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function HRManagement() {
  const { userRoles, isLoading } = useAuth();
  const [attendanceOpen, setAttendanceOpen] = usePersistedState("hr-attendance-open", true);
  const [eodOpen, setEodOpen] = usePersistedState("hr-eod-open", true);

  // Check if user has required role
  const allowedRoles = ['admin', 'ops', 'dev'];
  const hasAccess = userRoles.some(role => allowedRoles.includes(role));

  if (isLoading) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="HR Management"
          subtitle="Employee attendance tracking and EOD submissions"
        />
        
        <div className="space-y-4">
          {/* Employee Attendance Tracker Card */}
          <Collapsible open={attendanceOpen} onOpenChange={setAttendanceOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Employee Attendance Tracker</CardTitle>
                    </div>
                    {attendanceOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <EmployeeAttendanceTracker />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* EOD Submissions Card */}
          <Collapsible open={eodOpen} onOpenChange={setEodOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">End-of-Day (EOD) Submissions</CardTitle>
                    </div>
                    {eodOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <EODSubmissionsCard />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
