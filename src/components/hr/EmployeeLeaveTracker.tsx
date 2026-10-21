import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle, FileText, Download, Plus, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCapability } from "@/hooks/useCapability";

// Mutation rights mirror the employee_leave_requests RLS tier (is_leave_admin):
// admin/ops/dev only. Everyone else who can reach this tab is read-only.
const LEAVE_ADMIN_ROLES = ['admin', 'ops', 'dev'];

interface EmployeeLeaveTrackerProps {
  /** When true, only shows leave requests from setters assigned to the current user */
  managerScope?: boolean;
}

export function EmployeeLeaveTracker({ managerScope = false }: EmployeeLeaveTrackerProps) {
  const queryClient = useQueryClient();
  const { user, userRoles } = useAuth();
  const [filter, setFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // 7 Oct: Ops Command holders (Daniel covering Elena) manage leave too;
  // is_leave_admin() grants the same in the database.
  const { has: hasOpsCommand } = useCapability("can_view_ops_command");
  const isLeaveAdmin = userRoles.some(r => LEAVE_ADMIN_ROLES.includes(r)) || hasOpsCommand;
  const canAddOnBehalf = !managerScope && isLeaveAdmin;

  // If managerScope, first fetch assigned setter user IDs
  const { data: assignedUserIds } = useQuery({
    queryKey: ['manager-assigned-user-ids', user?.id],
    queryFn: async () => {
      const { data: assignments } = await supabase
        .from('sdr_manager_assignments')
        .select('setter_profile_id')
        .eq('manager_user_id', user!.id);
      if (!assignments?.length) return [];
      const ids = assignments.map(a => a.setter_profile_id);
      const { data: setters } = await supabase
        .from('setters_profiles')
        .select('user_id')
        .in('id', ids)
        .eq('active', true)
        .eq("is_test_account", false);
      return (setters || []).map(s => s.user_id).filter(Boolean) as string[];
    },
    enabled: managerScope && !!user?.id,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['all-leave-requests', managerScope, assignedUserIds],
    queryFn: async () => {
      let query = supabase
        .from('employee_leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (managerScope && assignedUserIds?.length) {
        query = query.in('user_id', assignedUserIds);
      } else if (managerScope) {
        return []; // no assignments = no results
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: managerScope ? !!assignedUserIds : true,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('employee_leave_requests')
        .update({
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-leave-requests'] });
      toast.success("Leave request updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({
      id, reason, leave_days_amount, leave_start_date, return_date, status, admin_notes,
    }: {
      id: string;
      reason: string;
      leave_days_amount: number;
      leave_start_date: string;
      return_date: string;
      status: string;
      admin_notes: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('employee_leave_requests')
        .update({
          reason,
          leave_days_amount,
          leave_start_date,
          return_date,
          status,
          admin_notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-leave-requests'] });
      toast.success("Leave request updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employee_leave_requests')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-leave-requests'] });
      toast.success("Leave request deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDownloadNote = async (path: string) => {
    const { data } = await supabase.storage.from('doctor-notes').createSignedUrl(path, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    } else {
      toast.error("Could not generate download link");
    }
  };

  // Build employee options from request data
  const employeeOptions = Array.from(
    new Map(
      requests.map((r: any) => [r.user_id, { id: r.user_id, name: r.full_name, email: r.email }])
    ).values()
  ).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

  // Build month options spanning the data range (most recent first)
  const monthOptions = (() => {
    if (!requests.length) return [] as { value: string; label: string }[];
    const set = new Set<string>();
    requests.forEach((r: any) => {
      const d = new Date(r.leave_start_date);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => {
        const [y, m] = value.split('-').map(Number);
        return { value, label: format(new Date(y, m - 1, 1), 'MMMM yyyy') };
      });
  })();

  const filtered = requests.filter((r: any) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (employeeFilter !== 'all' && r.user_id !== employeeFilter) return false;
    if (monthFilter !== 'all') {
      const d = new Date(r.leave_start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== monthFilter) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'sick': return 'Sick Leave';
      case 'holiday': return 'Holiday';
      case 'family_personal': return 'Family / Personal';
      default: return reason;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          {canAddOnBehalf && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-4 w-4" /> Log Leave
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Log Leave on Behalf of Employee</DialogTitle>
                </DialogHeader>
                <AdminLeaveOnBehalfForm
                  onSuccess={() => {
                    setAddDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['all-leave-requests'] });
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employeeOptions.map((emp: any) => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name || emp.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No {filter !== 'all' ? filter : ''} leave requests.</p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Leave Dates</TableHead>
                <TableHead>Doctor's Note</TableHead>
              <TableHead>Status</TableHead>
              {isLeaveAdmin && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((req: any) => (
              <LeaveRequestRow
                key={req.id}
                request={req}
                canManage={isLeaveAdmin}
                getStatusBadge={getStatusBadge}
                  getReasonLabel={getReasonLabel}
                  onApprove={(id, notes) => updateMutation.mutate({ id, status: 'approved', adminNotes: notes })}
                  onReject={(id, notes) => updateMutation.mutate({ id, status: 'rejected', adminNotes: notes })}
                  onEdit={(payload) => editMutation.mutate(payload)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onDownloadNote={handleDownloadNote}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

interface EditPayload {
  id: string;
  reason: string;
  leave_days_amount: number;
  leave_start_date: string;
  return_date: string;
  status: string;
  admin_notes: string | null;
}

function LeaveRequestRow({
  request,
  canManage,
  getStatusBadge,
  getReasonLabel,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onDownloadNote,
}: {
  request: any;
  canManage: boolean;
  getStatusBadge: (s: string) => React.ReactNode;
  getReasonLabel: (r: string) => string;
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string, notes?: string) => void;
  onEdit: (payload: EditPayload) => void;
  onDelete: (id: string) => void;
  onDownloadNote: (path: string) => void;
}) {
  const [notes, setNotes] = useState(request.admin_notes || '');
  const [editOpen, setEditOpen] = useState(false);

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="text-sm font-medium">{request.full_name}</p>
          <p className="text-xs text-muted-foreground">{request.email}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm">{getReasonLabel(request.reason)}</TableCell>
      <TableCell className="text-sm">{request.leave_days_amount}</TableCell>
      <TableCell className="text-xs">
        {format(new Date(request.leave_start_date), 'MMM dd')} – {format(new Date(request.return_date), 'MMM dd, yyyy')}
      </TableCell>
      <TableCell>
        {request.doctor_note_path ? (
          <Button variant="ghost" size="sm" onClick={() => onDownloadNote(request.doctor_note_path)} className="gap-1 text-xs">
            <Download className="h-3 w-3" /> View
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>{getStatusBadge(request.status)}</TableCell>
      {canManage && (
        <TableCell>
          <div className="space-y-2 min-w-[200px]">
            {request.status === 'pending' ? (
              <>
                <Textarea
                  placeholder="Admin notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs min-h-[50px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={() => onApprove(request.id, notes)} className="text-xs">
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onReject(request.id, notes)} className="text-xs">
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditOpen(true)}
                    className="text-xs gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <DeleteLeaveButton onConfirm={() => onDelete(request.id)} />
                </div>
              </>
            ) : (
              <>
                {request.admin_notes && (
                  <p className="text-xs text-muted-foreground max-w-[220px]">{request.admin_notes}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditOpen(true)}
                    className="text-xs gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <DeleteLeaveButton onConfirm={() => onDelete(request.id)} />
                </div>
              </>
            )}
          </div>

          <EditLeaveDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            request={request}
            onSubmit={(payload) => {
              onEdit(payload);
              setEditOpen(false);
            }}
          />
        </TableCell>
      )}
    </TableRow>
  );
}

function AdminLeaveOnBehalfForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [leaveDaysAmount, setLeaveDaysAmount] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['all-employees-for-leave'],
    queryFn: async () => {
      // Leave can only be logged for current staff (one leaver rule, 13 Oct).
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .is('offboarded_at' as never, null)
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !reason || !leaveDaysAmount || !leaveStartDate || !returnDate) {
      toast.error("Please fill out all required fields");
      return;
    }
    const selectedEmployee = employees.find((emp: any) => emp.id === selectedUserId);
    if (!selectedEmployee) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('employee_leave_requests').insert({
        user_id: selectedUserId,
        full_name: selectedEmployee.full_name || 'Unknown',
        email: selectedEmployee.email || '',
        reason,
        leave_days_amount: parseInt(leaveDaysAmount),
        leave_start_date: leaveStartDate,
        return_date: returnDate,
        status: 'approved',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: adminNotes.trim() || `Logged on behalf by admin`,
      });
      if (error) throw error;
      toast.success("Leave logged and auto-approved");
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to log leave: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">Employee <span className="text-destructive">*</span></Label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Select employee..." />
          </SelectTrigger>
          <SelectContent>
            {employees.map((emp: any) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.full_name || emp.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Reason <span className="text-destructive">*</span></Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue placeholder="Select reason..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sick">Sick Leave</SelectItem>
            <SelectItem value="holiday">Holiday</SelectItem>
            <SelectItem value="family_personal">Family / Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs">Start Date <span className="text-destructive">*</span></Label>
          <Input type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Return Date <span className="text-destructive">*</span></Label>
          <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Days <span className="text-destructive">*</span></Label>
          <Input type="number" min="1" value={leaveDaysAmount} onChange={(e) => setLeaveDaysAmount(e.target.value)} placeholder="e.g. 3" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Notes</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Add any notes about this leave request..."
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Submitting..." : "Log & Auto-Approve"}
      </Button>
    </form>
  );
}

function EditLeaveDialog({
  open,
  onOpenChange,
  request,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  onSubmit: (payload: {
    id: string;
    reason: string;
    leave_days_amount: number;
    leave_start_date: string;
    return_date: string;
    status: string;
    admin_notes: string | null;
  }) => void;
}) {
  const [reason, setReason] = useState(request.reason || '');
  const [days, setDays] = useState(String(request.leave_days_amount ?? ''));
  const [startDate, setStartDate] = useState(request.leave_start_date?.slice(0, 10) || '');
  const [endDate, setEndDate] = useState(request.return_date?.slice(0, 10) || '');
  const [status, setStatus] = useState(request.status || 'pending');
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '');

  // Re-sync state if a different request is opened
  const reset = () => {
    setReason(request.reason || '');
    setDays(String(request.leave_days_amount ?? ''));
    setStartDate(request.leave_start_date?.slice(0, 10) || '');
    setEndDate(request.return_date?.slice(0, 10) || '');
    setStatus(request.status || 'pending');
    setAdminNotes(request.admin_notes || '');
  };

  const handleOpenChange = (v: boolean) => {
    if (v) reset();
    onOpenChange(v);
  };

  const handleSave = () => {
    if (!reason || !days || !startDate || !endDate) {
      toast.error('Please fill out reason, dates, and days');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error('Return date cannot be before start date');
      return;
    }
    onSubmit({
      id: request.id,
      reason,
      leave_days_amount: parseInt(days, 10),
      leave_start_date: startDate,
      return_date: endDate,
      status,
      admin_notes: adminNotes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Leave Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Employee</Label>
            <p className="text-sm font-medium">{request.full_name}</p>
            <p className="text-xs text-muted-foreground">{request.email}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="holiday">Holiday</SelectItem>
                <SelectItem value="family_personal">Family / Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Return Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Days</Label>
              <Input
                type="number"
                min="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Admin Notes</Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Optional notes..."
              className="min-h-[70px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLeaveButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs gap-1 text-destructive hover:text-destructive">
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete leave request?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the leave entry. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
