import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Avatar, ButtonV2, DetailHeader, FactsStrip, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, differenceInMonths, differenceInYears } from "date-fns";
import { STAFF_STATUS_LABEL } from "@/lib/staffStatus";
import { EmployeeOverviewTab } from "@/components/hr/employee-profile/EmployeeOverviewTab";
import { EmployeeDocumentsTab } from "@/components/hr/employee-profile/EmployeeDocumentsTab";
import { EmployeePayrollTab } from "@/components/hr/employee-profile/EmployeePayrollTab";
import { EmployeeAttendanceTab } from "@/components/hr/employee-profile/EmployeeAttendanceTab";
import { EmployeePerformanceTab } from "@/components/hr/employee-profile/EmployeePerformanceTab";
import { EmployeeLeaveTab } from "@/components/hr/employee-profile/EmployeeLeaveTab";
import { TITLE_LABELS, TITLE_ORDER, type SetterTitle } from "@/lib/setterTitles";

const DEPARTMENTS = [
  { value: 'fulfilment', label: 'Fulfilment' },
  { value: 'acquisition', label: 'Sales / Acquisition' },
  { value: 'sales', label: 'Sales (AE)' },
  { value: 'operations', label: 'Operations' },
  { value: 'hr', label: 'HR' },
  { value: 'accounting', label: 'Accounting' }
];

const departmentLabel = (department: string | null | undefined) => {
  if (!department) return '—';
  if (department === 'fulfilment') return 'Fulfilment';
  if (department === 'acquisition') return 'Sales';
  return department.charAt(0).toUpperCase() + department.slice(1);
};

export function EmployeeProfileView({ employeeId, backPath = "/admin/hr/employees" }: { employeeId: string | undefined; backPath?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    start_date: '',
    department: '',
    active: true,
    job_title: '',
    leave_allowance_days: '',
    title: 'sdr',
    per_meeting_bonus: '50',
    base_salary: '',
    ae_commission_percentage: '10',
  });

  // Fetch employee data
  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee-profile', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;

      // Get profile
      // job_title / leave_allowance_days landed 29 Sep and are not in types.ts yet.
      type ProfileRow = {
        id: string; full_name: string | null; email: string | null; avatar_url: string | null;
        phone: string | null; birthday: string | null; created_at: string; offboarded_at: string | null;
        job_title: string | null; leave_allowance_days: number | null; start_date: string | null;
      };
      const { data: profileRaw, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, phone, birthday, created_at, offboarded_at, job_title, leave_allowance_days, start_date' as 'id')
        .eq('id', employeeId)
        .single();

      if (profileError) throw profileError;
      const profile = profileRaw as unknown as ProfileRow;

      // Get user roles
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', employeeId);

      // Get setter profile if exists
      const { data: setterProfile } = await supabase
        .from('setters_profiles')
        .select('*')
        .eq('user_id', employeeId)
        .maybeSingle();

      const primaryRole = userRoles?.[0]?.role || 'unknown';

      // Map role to department
      const getDepartment = () => {
        if (setterProfile?.department) return setterProfile.department;
        if (['hr'].includes(primaryRole)) return 'hr';
        if (['accounting', 'finance'].includes(primaryRole)) return 'accounting';
        if (['ops', 'csm'].includes(primaryRole)) return 'operations';
        if (['account_executive'].includes(primaryRole)) return 'sales';
        if (['dev', 'admin'].includes(primaryRole)) return 'operations';
        return 'operations';
      };

      // Start date: setters_profiles for setters, else profiles.start_date (2 Oct: staff
      // without a setter row, e.g. TA and finance, used to lose it on save), else created_at.
      const startDate = setterProfile?.start_date || profile.start_date || profile.created_at;

      return {
        ...profile,
        role: primaryRole,
        roles: userRoles?.map(r => r.role) || [],
        department: getDepartment(),
        // Leavers are offboarded on the profile; inactive setter rows count too.
        active: !profile.offboarded_at && (setterProfile?.active ?? true),
        job_title: profile.job_title ?? null,
        leave_allowance_days: profile.leave_allowance_days ?? null,
        setterProfile,
        setterId: setterProfile?.id,
        start_date: startDate
      };
    },
    enabled: !!employeeId
  });

  // Fetch document expiry warnings
  const { data: expiringDocs = [] } = useQuery({
    queryKey: ['expiring-docs', employeeId],
    queryFn: async () => {
      if (!employee?.setterId) return [];

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data } = await supabase
        .from('employee_documents')
        .select('id, document_name, expiry_date')
        .eq('employee_id', employee.setterId)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .order('expiry_date');

      return data || [];
    },
    enabled: !!employee?.setterId
  });

  // Fetch AE compensation if applicable
  const { data: aeCompensation } = useQuery({
    queryKey: ['ae-compensation', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase
        .from('ae_compensation')
        .select('*')
        .eq('user_id', employeeId)
        .maybeSingle();
      return data;
    },
    enabled: !!employeeId,
  });

  // Fetch profile base_salary (for non-setter roles)
  const { data: profileExtra } = useQuery({
    queryKey: ['profile-base-salary', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await (supabase.from('profiles').select('base_salary') as any)
        .eq('id', employeeId)
        .maybeSingle();
      return data;
    },
    enabled: !!employeeId,
  });

  // Update employee mutation
  const updateEmployee = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const isAE = employee?.role === 'account_executive';
      const isSetter = employee?.role === 'setter';
      const baseSalaryNum = data.base_salary ? parseFloat(data.base_salary) : 0;

      // Update profiles (name, phone, base_salary for non-setter/AE)
      const profileUpdate: any = {
        full_name: data.full_name,
        phone: data.phone || null,
        job_title: data.job_title?.trim() || null,
        leave_allowance_days: data.leave_allowance_days ? parseFloat(data.leave_allowance_days) : null,
        start_date: data.start_date || null,
      };
      if (!isSetter) {
        // AE salary lives in ae_compensation; other roles use profiles.base_salary.
        // Still update profiles.base_salary as a canonical value for non-variable roles.
        if (!isAE) profileUpdate.base_salary = baseSalaryNum;
      }
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', employeeId);
      if (profileError) throw profileError;

      // AE compensation
      if (isAE) {
        const { error: compError } = await supabase.from('ae_compensation').upsert(
          {
            user_id: employeeId!,
            base_salary: baseSalaryNum,
            commission_percentage: data.ae_commission_percentage
              ? parseFloat(data.ae_commission_percentage)
              : 10,
          },
          { onConflict: 'user_id' }
        );
        if (compError) throw compError;
      }

      // Roles whose setters_profiles row (if any) exists purely to hold a
      // (the Close user ID field retired 14 Oct 2026; the feed stopped 1 Oct).
      const isCloseIdOnlyRole =
        !isSetter && !isAE && ['ops', 'ops_assistant', 'hr'].includes(employee?.role ?? '');

      // Setter profile (existing logic)
      if (employee?.setterId) {
        // 29 Sep: ops/hr rows used to accept only the Close ID, so Elena's
        // department and active edits vanished. Pay fields stay untouched.
        const setterUpdate = isCloseIdOnlyRole
          ? {
              full_name: data.full_name,
              department: data.department,
              active: data.active,
              start_date: data.start_date || null,
            }
          : {
              full_name: data.full_name,
              department: data.department,
              active: data.active,
              start_date: data.start_date || null,
              title: data.title,
              per_meeting_bonus: data.per_meeting_bonus ? parseFloat(data.per_meeting_bonus) : null,
              base_salary: isSetter ? baseSalaryNum : (employee?.setterProfile?.base_salary ?? null),
            };
        const { error: setterError } = await supabase
          .from('setters_profiles')
          .update(setterUpdate)
          .eq('id', employee.setterId);

        if (setterError) throw setterError;
      } else if (employeeId && isSetter) {
        const validDept = ['fulfilment', 'acquisition'].includes(data.department)
          ? data.department
          : 'fulfilment';
        const { error: createError } = await supabase
          .from('setters_profiles')
          .insert({
            user_id: employeeId,
            email: data.email || employee?.email || '',
            full_name: data.full_name,
            department: validDept,
            active: data.active,
            start_date: data.start_date || null,
          });

        if (createError) throw createError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-profile', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employees-directory'] });
      queryClient.invalidateQueries({ queryKey: ['ae-compensation', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['profile-base-salary', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['payslip-staff-options'] });
      toast.success('Employee profile updated');
      setIsEditModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update profile');
    }
  });

  const openEditModal = () => {
    if (employee) {
      const isAE = employee.role === 'account_executive';
      const isSetter = employee.role === 'setter';
      const defaultBase = isAE
        ? (aeCompensation?.base_salary ? String(aeCompensation.base_salary) : '')
        : isSetter
        ? (employee.setterProfile?.base_salary ? String(employee.setterProfile.base_salary) : '')
        : (profileExtra?.base_salary ? String(profileExtra.base_salary) : '');
      setEditForm({
        full_name: employee.full_name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        start_date: employee.start_date ? format(new Date(employee.start_date), 'yyyy-MM-dd') : '',
        department: employee.department || 'operations',
        active: employee.active ?? true,
        job_title: employee.job_title || '',
        leave_allowance_days: employee.leave_allowance_days != null ? String(employee.leave_allowance_days) : '',
        title: employee.setterProfile?.title || 'sdr',
        per_meeting_bonus: String(employee.setterProfile?.per_meeting_bonus || 50),
        base_salary: defaultBase,
        ae_commission_percentage: aeCompensation?.commission_percentage
          ? String(aeCompensation.commission_percentage)
          : '10',
      });
      setIsEditModalOpen(true);
    }
  };

  const handleSave = () => {
    updateEmployee.mutate(editForm);
  };

  const formatTenure = (startDate: string) => {
    const start = new Date(startDate);
    const now = new Date();
    const years = differenceInYears(now, start);
    const months = differenceInMonths(now, start) % 12;

    if (years === 0) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <div className="flex items-start gap-[14px]">
          <Skeleton className="h-[52px] w-[52px] rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="py-12 text-center">
        <p className="text-[12.5px] text-[var(--dim)]">Employee not found</p>
        <ButtonV2 className="mt-4" onClick={() => navigate(backPath)}>
          Back to Employee Hub
        </ButtonV2>
      </div>
    );
  }

  const statusPill = employee.offboarded_at ? (
    <Pill>Former · left {format(new Date(employee.offboarded_at), 'd MMM yyyy')}</Pill>
  ) : employee.active ? (
    <Pill variant="ok">{STAFF_STATUS_LABEL.current}</Pill>
  ) : (
    <Pill variant="warn" title="Setter row switched off; still with us">{STAFF_STATUS_LABEL.benched}</Pill>
  );

  return (
    <>
      <div className="space-y-5">
        {/* Back to the hub */}
        <ButtonV2 variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(backPath)}>
          ← Back to Employee Hub
        </ButtonV2>

        {/* Profile header */}
        <div>
          <DetailHeader
            avatar={<Avatar name={employee.full_name || employee.email || 'Unknown'} src={employee.avatar_url} size={52} ring />}
            name={employee.full_name}
            email={employee.email}
            pills={<>
              <Pill variant="info" className="capitalize">{employee.role?.replace(/_/g, ' ')}</Pill>
              <Pill>{departmentLabel(employee.department)}</Pill>
              {statusPill}
            </>}
            actions={<ButtonV2 size="sm" onClick={openEditModal}>Edit profile</ButtonV2>}
          />
          <FactsStrip
            facts={[
              { label: "Started", value: employee.start_date ? format(new Date(employee.start_date), 'dd MMM yyyy') : '—' },
              { label: "Tenure", value: employee.start_date ? formatTenure(employee.start_date) : '—' },
              { label: "Phone", value: employee.phone || '—' },
              { label: "Job title", value: employee.job_title || '—' },
            ]}
          />
        </div>

        {/* Document expiry warnings */}
        {expiringDocs.length > 0 && (
          <Panel title="Documents expiring soon" aside={<Pill variant="warn">{expiringDocs.length}</Pill>}>
            <RowList columns="minmax(0,1fr) 130px">
              {expiringDocs.map((doc) => (
                <Row key={doc.id}>
                  <RowName primary={doc.document_name} />
                  <RowNum className="text-[var(--warn)]">
                    {doc.expiry_date ? format(new Date(doc.expiry_date), 'dd MMM yyyy') : '—'}
                  </RowNum>
                </Row>
              ))}
            </RowList>
          </Panel>
        )}

        {/* Tabbed content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5">
            <EmployeeOverviewTab employee={employee} />
          </TabsContent>

          <TabsContent value="documents" className="mt-5">
            <EmployeeDocumentsTab employee={employee} />
          </TabsContent>

          <TabsContent value="payroll" className="mt-5">
            <EmployeePayrollTab employee={employee} />
          </TabsContent>

          <TabsContent value="attendance" className="mt-5">
            <EmployeeAttendanceTab employee={employee} />
          </TabsContent>

          <TabsContent value="leave" className="mt-5">
            <EmployeeLeaveTab employee={employee} />
          </TabsContent>

          <TabsContent value="performance" className="mt-5">
            <EmployeePerformanceTab employee={employee} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Profile Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Employee name"
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                value={editForm.email}
                disabled
              />
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">Email cannot be changed</p>
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+44 7XXX XXXXXX"
              />
            </div>

            <div>
              <Label>Job Title</Label>
              <Input
                value={editForm.job_title}
                onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                placeholder="e.g. Head of Recruitment"
              />
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">Printed as the designation on payslips</p>
            </div>

            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={editForm.start_date}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                className="[color-scheme:dark]"
              />
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">When the employee started at the company</p>
            </div>

            {employee?.setterId && (
              <div>
                <Label>Department</Label>
                <Select
                  value={editForm.department}
                  onValueChange={(value) => setEditForm({ ...editForm, department: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept.value} value={dept.value}>
                        {dept.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {employee?.role === 'setter' && (
              <>
                <div>
                  <Label>Level</Label>
                  <Select
                    value={editForm.title}
                    onValueChange={(value) => setEditForm({ ...editForm, title: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[...TITLE_ORDER, ...(editForm.title === 'ae' ? (['ae'] as SetterTitle[]) : [])].map((t) => (
                        <SelectItem key={t} value={t}>
                          {TITLE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Per Meeting Bonus (£)</Label>
                  <Input
                    type="number"
                    value={editForm.per_meeting_bonus}
                    onChange={(e) => setEditForm({ ...editForm, per_meeting_bonus: e.target.value })}
                    placeholder="50"
                  />
                </div>
              </>
            )}

            {/* Base Salary — universal (all roles) */}
            <div>
              <Label>Base Salary (per month)</Label>
              <Input
                type="number"
                value={editForm.base_salary}
                onChange={(e) => setEditForm({ ...editForm, base_salary: e.target.value })}
                placeholder="0.00"
              />
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">
                Monthly base salary paid every cycle, in the employee's pay currency{employee?.setterProfile?.currency ? ` (${employee.setterProfile.currency})` : ''}. Prefilled on payslips.
              </p>
            </div>

            <div>
              <Label>Annual Leave Allowance (days)</Label>
              <Input
                type="number"
                step="0.5"
                value={editForm.leave_allowance_days}
                onChange={(e) => setEditForm({ ...editForm, leave_allowance_days: e.target.value })}
                placeholder="e.g. 15"
              />
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">Payslips show this minus approved holiday taken this year</p>
            </div>

            {/* AE-only: commission % */}
            {employee?.role === 'account_executive' && (
              <div>
                <Label>Commission % on Cash Collected</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.ae_commission_percentage}
                  onChange={(e) => setEditForm({ ...editForm, ae_commission_percentage: e.target.value })}
                  placeholder="10"
                />
                <p className="mt-1 text-[11.5px] text-[var(--dim)]">
                  Percentage the AE earns on every new-deal cash collected (default 10%).
                </p>
              </div>
            )}

            {employee?.setterId && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Active Status</Label>
                  <p className="text-[11.5px] text-[var(--dim)]">Deactivate to disable employee access</p>
                </div>
                <Switch
                  checked={editForm.active}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, active: checked })}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <ButtonV2 onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </ButtonV2>
            <ButtonV2
              variant="primary"
              onClick={handleSave}
              disabled={!editForm.full_name || updateEmployee.isPending}
            >
              {updateEmployee.isPending ? 'Saving...' : 'Save Changes'}
            </ButtonV2>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EmployeeProfile() {
  const { employeeId } = useParams<{ employeeId: string }>();

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <EmployeeProfileView employeeId={employeeId} />
      </PageContainer>
    </DashboardLayout>
  );
}
