import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fetchOffboardedUserMap } from "@/hooks/useOffboardedUsers";
import { STAFF_STATUS_LABEL } from "@/lib/staffStatus";

type StatusFilter = "active" | "former" | "all";

// 13 Oct (the owner): the hub mixed trialists, partners and the core team in one
// list with only a status filter. Role + department filters let Elena cut it
// down ("just setters", "just fulfilment") without changing who is listed.
const ROLE_LABELS: Record<string, string> = {
  setter: "Setter",
  account_executive: "Account Executive",
  sdr_manager: "SDR Manager",
  csm: "CSM",
  ops: "Ops",
  ops_assistant: "Ops Assistant",
  hr: "HR",
  talent_acquisition: "Talent Acquisition",
  finance: "Finance",
  accounting: "Accounting",
  gtm_engineer: "GTM Engineer",
  admin: "Admin",
  dev: "Dev",
  partner: "Partner",
  trialist: "Trialist",
};
const roleLabel = (r: string) => ROLE_LABELS[r] ?? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const DEPARTMENT_LABELS: Record<string, string> = {
  fulfilment: "Fulfilment",
  acquisition: "Sales",
  operations: "Operations",
  sales: "AE",
  hr: "HR",
  accounting: "Accounting",
};

export function EmployeeHubView({ basePath = "/admin/hr/employees" }: { basePath?: string }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  // Default hides leavers; "Former"/"All" surface them with their leaving date.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Fetch all team members from profiles + user_roles (not just setters)
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees-directory'],
    queryFn: async () => {
      // Get all non-client users with their roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .neq('role', 'client');

      if (rolesError) throw rolesError;

      if (!userRoles?.length) return [];

      const userIds = [...new Set(userRoles.map(r => r.user_id))];

      // Get profiles for these users
      type HubProfileRow = {
        id: string; full_name: string | null; email: string | null; avatar_url: string | null;
        created_at: string; start_date: string | null;
      };
      const { data: profilesRaw, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, created_at, start_date' as 'id')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      const profiles = profilesRaw as unknown as HubProfileRow[] | null;

      // The platform-wide former-employee flag (profiles.offboarded_at).
      const offboardedMap = await fetchOffboardedUserMap();

      // Get setter profiles for department info (if exists)
      const { data: setterProfiles } = await supabase
        .from('setters_profiles')
        .select('user_id, department, active, start_date')
        .in('user_id', userIds);

      // Merge data
      return profiles?.map(p => {
        const roles = userRoles.filter(r => r.user_id === p.id);
        const setterProfile = setterProfiles?.find(sp => sp.user_id === p.id);
        const primaryRole = roles[0]?.role || 'unknown';

        // Map role to display department
        const getDepartment = () => {
          if (setterProfile?.department) return setterProfile.department;
          if (['hr'].includes(primaryRole)) return 'hr';
          if (['accounting', 'finance'].includes(primaryRole)) return 'accounting';
          if (['ops', 'csm'].includes(primaryRole)) return 'operations';
          if (['account_executive'].includes(primaryRole)) return 'sales';
          if (['dev', 'admin'].includes(primaryRole)) return 'operations';
          return 'operations';
        };

        // Someone who has been offboarded is never "Active", whether or not
        // they ever had a setter profile row (this is the old `?? true` bug).
        const offboardedAt = offboardedMap.get(p.id) ?? null;

        return {
          id: p.id,
          user_id: p.id,
          full_name: p.full_name,
          email: p.email,
          department: getDepartment(),
          active: !offboardedAt && (setterProfile?.active ?? true),
          offboarded_at: offboardedAt,
          created_at: p.created_at,
          start_date: setterProfile?.start_date || p.start_date || p.created_at,
          avatar_url: p.avatar_url,
          role: primaryRole,
        };
      }) || [];
    }
  });

  // Filter employees based on employment status, then search
  const filteredEmployees = employees.filter((emp) => {
    // 29 Sep (the owner): "Current" means still with us — offboarded profiles AND
    // inactive setter rows are former staff.
    if (statusFilter === 'active' && !emp.active) return false;
    if (statusFilter === 'former' && emp.active) return false;
    if (roleFilter !== 'all' && emp.role !== roleFilter) return false;
    if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
    return (
      emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Only roles / departments that actually occur, so the dropdowns stay short.
  const roleOptions = [...new Set(employees.map((e) => e.role).filter(Boolean))].sort((a, b) =>
    roleLabel(a).localeCompare(roleLabel(b)),
  );
  const departmentOptions = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort();

  const statusPill = (emp: { offboarded_at: string | null; active: boolean }) => {
    if (emp.offboarded_at) return <Pill>{STAFF_STATUS_LABEL.former}</Pill>;
    if (emp.active) return <Pill variant="ok">{STAFF_STATUS_LABEL.current}</Pill>;
    return <Pill variant="warn" title="Setter row switched off; still with us">{STAFF_STATUS_LABEL.benched}</Pill>;
  };

  return (
    <div className="space-y-4">
      {/* Search + status, role and department filters on one line */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
          <Input
            placeholder="Search by name, email, or department…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]" aria-label="Employment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Current employees</SelectItem>
            <SelectItem value="former">Former employees</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[170px]" aria-label="Role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[170px]" aria-label="Department">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d] ?? d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-mono text-[11px] text-[var(--dim)]">
          {filteredEmployees.length} of {employees.length}
        </span>
      </div>

      <Panel title="Team" aside={<Pill>{filteredEmployees.length}</Pill>}>
        {isLoading ? (
          <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">Loading employees…</p>
        ) : filteredEmployees.length === 0 ? (
          <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No employees found.</p>
        ) : (
          <RowList
            columns="minmax(0,1.6fr) 150px 120px 130px 110px"
            head={["Name", "Role", "Department", "Status", "Start date"]}
          >
            {filteredEmployees.map((emp) => (
              <Row key={emp.id} onClick={() => navigate(`${basePath}/${emp.id}`)}>
                <RowName
                  lead={<Avatar name={emp.full_name || emp.email || "?"} src={emp.avatar_url} size={28} />}
                  primary={emp.full_name || 'Unknown'}
                  secondary={emp.email}
                />
                <div><Pill>{emp.role ? roleLabel(emp.role) : 'N/A'}</Pill></div>
                <div><Pill variant="info">{DEPARTMENT_LABELS[emp.department] || emp.department || 'N/A'}</Pill></div>
                <div className="flex flex-col items-start gap-[3px]">
                  {statusPill(emp)}
                  {emp.offboarded_at && (
                    <span className="font-mono text-[10.5px] text-[var(--dim)]">
                      Left {format(new Date(emp.offboarded_at), 'dd MMM yyyy')}
                    </span>
                  )}
                </div>
                <RowNum className="text-[var(--ink2)]">
                  {emp.start_date ? format(new Date(emp.start_date), 'dd MMM yyyy') : '—'}
                </RowNum>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
    </div>
  );
}

export default function EmployeeHub() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Employee Hub"
          subtitle="Team directory and employee information"
        />
        <EmployeeHubView />
      </PageContainer>
    </DashboardLayout>
  );
}
