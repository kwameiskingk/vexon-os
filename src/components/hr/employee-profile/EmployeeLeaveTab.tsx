import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarOff, FileText, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/AuthContext";
import { useCapability } from "@/hooks/useCapability";

// Mirrors the employee_leave_requests RLS tier (is_leave_admin): admin/ops/dev only.
const LEAVE_ADMIN_ROLES = ['admin', 'ops', 'dev'];

interface EmployeeLeaveTabProps {
  employee: any;
}

export function EmployeeLeaveTab({ employee }: EmployeeLeaveTabProps) {
  const queryClient = useQueryClient();
  const { userRoles } = useAuth();
  const { has: hasOpsCommand } = useCapability("can_view_ops_command");
  const isLeaveAdmin = userRoles.some(r => LEAVE_ADMIN_ROLES.includes(r)) || hasOpsCommand;

  const { data: leaveRequests = [], isLoading } = useQuery({
    queryKey: ['employee-leave-requests', employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_leave_requests')
        .select('*')
        .eq('user_id', employee.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!employee.id
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('employee_leave_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-leave-requests', employee.id] });
      toast.success('Leave request updated');
    },
    onError: () => toast.error('Failed to update leave request')
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Pending</Badge>;
    }
  };

  if (isLoading) {
    return <Card><CardContent className="p-6 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  if (leaveRequests.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={CalendarOff}
            title="No Leave Requests"
            description="This employee has not submitted any leave requests."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Leave Requests ({leaveRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {leaveRequests.map((req: any) => (
              <div key={req.id} className="flex items-start justify-between p-4 rounded-lg border bg-muted/20">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{req.reason || 'Leave'}</span>
                    {getStatusBadge(req.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const start = req.leave_start_date || req.start_date;
                      const end = req.return_date || req.end_date;
                      const startDate = start ? new Date(start) : null;
                      const endDate = end ? new Date(end) : null;
                      const validStart = startDate && !isNaN(startDate.getTime());
                      const validEnd = endDate && !isNaN(endDate.getTime());
                      return (
                        <>
                          {validStart ? format(startDate!, 'dd MMM yyyy') : '—'}
                          {validEnd && end !== start && <> — {format(endDate!, 'dd MMM yyyy')}</>}
                          {req.leave_days_amount && <span className="ml-2">({req.leave_days_amount} day{req.leave_days_amount !== 1 ? 's' : ''})</span>}
                        </>
                      );
                    })()}
                  </p>
                  {req.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{req.notes}</p>
                  )}
                  {(req.doctor_note_path || req.doctor_note_url) && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs gap-1"
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from('doctor-notes')
                          .createSignedUrl(req.doctor_note_path || req.doctor_note_url, 300);
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                      }}
                    >
                      <FileText className="h-3 w-3" />
                      Doctor's Note
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {req.admin_notes && (
                    <p className="text-xs text-muted-foreground italic mt-1">Admin: {req.admin_notes}</p>
                  )}
                </div>
                {isLeaveAdmin && req.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" className="text-emerald-500" onClick={() => updateStatus.mutate({ id: req.id, status: 'approved' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => updateStatus.mutate({ id: req.id, status: 'rejected' })}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
