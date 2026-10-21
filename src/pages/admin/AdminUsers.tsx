import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { InviteAdminModal } from "@/components/admin/InviteAdminModal";
import { DepartmentAccessModal } from "@/components/admin/DepartmentAccessModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2 } from "lucide-react";
import { fetchOffboardedUserMap } from "@/hooks/useOffboardedUsers";

interface DepartmentAccess {
  department: string;
}

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  created_at: string;
  departmentAccess: string[];
  /** setters_profiles.active — null when the user has no setter/AE profile
   *  row (office staff), which counts as current. Display info only; the
   *  authoritative "has left" flag is offboardedAt. */
  active: boolean | null;
  /** profiles.offboarded_at — the platform-wide former-employee flag. */
  offboardedAt: string | null;
}

type ActiveFilter = "current" | "former" | "all";

type FilterType = "all" | "admin" | "ops" | "csm" | "account_executive" | "setter" | "sdr_manager" | "gtm_engineer" | "ops_assistant";

// Roles that can create users
const CREATE_USER_ROLES = ["admin", "dev"];
// Roles that can invite admins
const INVITE_ADMIN_ROLES = ["admin", "dev"];
// Roles that can edit department access
const DEPARTMENT_ACCESS_ROLES = ["admin", "dev"];
// Roles to display in UI (excluding dev and client)
const DISPLAY_ROLES = ["admin", "ops", "finance", "csm", "sdr_manager", "talent_acquisition", "account_executive", "setter", "hr", "accounting", "gtm_engineer", "ops_assistant"];

const DEPARTMENT_LABELS: Record<string, string> = {
  operations: 'Operations',
  sales: 'Sales',
  accounting: 'Accounting',
  hr: 'HR',
};

const AdminUsers = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  // Default hides former staff — the pre-2026-08-11 page mixed leavers in
  // indistinguishably; "Former"/"All" surface them on demand.
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("current");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);

  useEffect(() => {
    loadUsers();
    loadCurrentUserRole();
  }, []);

  const loadCurrentUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setCurrentUserRole(roleData?.role || null);
    }
  };

  const loadUsers = async () => {
    try {
      // Get all profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at");
      if (profilesError) throw profilesError;

      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      // Get all department access
      const { data: deptAccess, error: deptError } = await supabase
        .from("user_department_access")
        .select("user_id, department");
      if (deptError) throw deptError;

      // Former-employee flag (profiles.offboarded_at) — covers everyone,
      // including non-setters like ops/HR/SDR-manager leavers.
      const offboardedMap = await fetchOffboardedUserMap();

      // Setter/AE profile active flags — kept as supplementary display info
      // (a setter can be benched without having left the company).
      const { data: setterProfiles, error: setterError } = await supabase
        .from("setters_profiles")
        .select("user_id, active");
      if (setterError) throw setterError;
      const activeByUserId = new Map(
        (setterProfiles || []).filter(s => s.user_id).map(s => [s.user_id as string, s.active]),
      );

      const usersWithRoles = profiles?.map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        const userDepts = deptAccess?.filter(d => d.user_id === profile.id).map(d => d.department) || [];
        return {
          id: profile.id,
          email: profile.email || "",
          full_name: profile.full_name || "",
          role: userRole?.role || null,
          created_at: profile.created_at,
          departmentAccess: userDepts,
          active: activeByUserId.get(profile.id) ?? null,
          offboardedAt: offboardedMap.get(profile.id) ?? null,
        };
      }) || [];

      // Filter out dev and client users from the list
      const filteredUsers = usersWithRoles.filter(user => user.role !== "dev" && user.role !== "client");
      setUsers(filteredUsers);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId: string, newRole: string, oldRole: string | null) => {
    try {
      // Delete existing role
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;

      // Insert new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert([{
          user_id: userId,
          role: newRole as "admin" | "setter" | "client"
        }]);
      if (insertError) throw insertError;

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        action: "role_change",
        details: {
          user_id: userId,
          old_role: oldRole,
          new_role: newRole
        }
      });
      toast.success("Role updated successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // "Former" now means offboarded, not merely benched — so non-setter leavers
  // (ops, HR, SDR managers) classify correctly too.
  const isFormer = (user: UserWithRole) => !!user.offboardedAt;
  const filteredUsers = users.filter(user => {
    if (activeFilter === "current" && isFormer(user)) return false;
    if (activeFilter === "former" && !isFormer(user)) return false;
    if (filter === "all") return true;
    return user.role === filter;
  });

  const canCreateUser = currentUserRole && CREATE_USER_ROLES.includes(currentUserRole);
  const canInviteAdmin = currentUserRole && INVITE_ADMIN_ROLES.includes(currentUserRole);
  const canEditDepartmentAccess = currentUserRole && DEPARTMENT_ACCESS_ROLES.includes(currentUserRole);

  const handleEditDepartmentAccess = (user: UserWithRole) => {
    setSelectedUser(user);
    setDepartmentModalOpen(true);
  };

  const getDefaultDepartmentsForRole = (role: string | null): string[] => {
    switch (role) {
      case 'admin':
      case 'dev':
      case 'ops':
        return ['operations', 'sales', 'accounting', 'hr'];
      case 'csm':
        return ['operations'];
      case 'account_executive':
        return ['sales'];
      case 'finance':
      case 'accounting':
        return ['accounting'];
      case 'hr':
        return ['hr'];
      case 'setter':
        return ['operations'];
      case 'gtm_engineer':
        return ['gtm'];
      case 'ops_assistant':
        return ['operations'];
      default:
        return ['operations'];
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case "admin": return "default";
      case "ops": return "secondary";
      case "finance": return "outline";
      case "csm": return "secondary";
      case "account_executive": return "outline";
      case "setter": return "secondary";
      case "client": return "outline";
      default: return "outline";
    }
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="User Management"
          subtitle="Manage user roles and permissions"
          actions={
            <div className="flex gap-2">
              {canInviteAdmin && <InviteAdminModal />}
              {canCreateUser && <CreateUserModal onSuccess={loadUsers} />}
            </div>
          }
        />

        <div className="flex flex-wrap gap-2 mb-2">
          {(["current", "former", "all"] as ActiveFilter[]).map((f) => (
            <Badge
              key={f}
              variant={activeFilter === f ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setActiveFilter(f)}
            >
              {f === "current"
                ? `Current staff (${users.filter(u => !isFormer(u)).length})`
                : f === "former"
                  ? `Former (${users.filter(isFormer).length})`
                  : "All"}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={filter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilter("all")}
          >
            All Users ({users.length})
          </Badge>
          <Badge 
            variant={filter === "admin" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("admin")}
          >
            Admins ({users.filter(u => u.role === "admin").length})
          </Badge>
          <Badge 
            variant={filter === "ops" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("ops")}
          >
            Ops ({users.filter(u => u.role === "ops").length})
          </Badge>
          <Badge 
            variant={filter === "csm" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("csm")}
          >
            CSM ({users.filter(u => u.role === "csm").length})
          </Badge>
          <Badge 
            variant={filter === "account_executive" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("account_executive")}
          >
            AE ({users.filter(u => u.role === "account_executive").length})
          </Badge>
          <Badge 
            variant={filter === "setter" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("setter")}
          >
            Setters ({users.filter(u => u.role === "setter").length})
          </Badge>
          <Badge 
            variant={filter === "sdr_manager" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("sdr_manager")}
          >
            SDR Managers ({users.filter(u => u.role === "sdr_manager").length})
          </Badge>
          <Badge 
            variant={filter === "gtm_engineer" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("gtm_engineer")}
          >
            GTM ({users.filter(u => u.role === "gtm_engineer").length})
          </Badge>
          <Badge 
            variant={filter === "ops_assistant" ? "default" : "outline"} 
            className="cursor-pointer" 
            onClick={() => setFilter("ops_assistant")}
          >
            Ops Assistant ({users.filter(u => u.role === "ops_assistant").length})
          </Badge>
        </div>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users found for this filter
              </div>
            ) : (
              <div className="space-y-4">
                {filteredUsers.map(user => {
                  const displayDepts = user.departmentAccess.length > 0 
                    ? user.departmentAccess 
                    : getDefaultDepartmentsForRole(user.role);
                  
                  return (
                    <div 
                      key={user.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">
                            {user.full_name || user.email}
                          </p>
                          <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                            {user.role || "No role"}
                          </Badge>
                          {isFormer(user) && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Former
                            </Badge>
                          )}
                          {!isFormer(user) && user.active === false && (
                            <Badge variant="outline" className="text-xs text-amber-600" title="Setter row switched off; still with us">
                              Benched
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Departments:</span>
                          {displayDepts.map(dept => (
                            <Badge key={dept} variant="outline" className="text-xs">
                              {DEPARTMENT_LABELS[dept] || dept}
                            </Badge>
                          ))}
                          {user.departmentAccess.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">(default)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEditDepartmentAccess && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditDepartmentAccess(user)}
                            className="shrink-0"
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            Access
                          </Button>
                        )}
                        <div className="w-44">
                          <Select 
                            value={user.role || ""} 
                            onValueChange={value => updateRole(user.id, value, user.role)}
                          >
                            <SelectTrigger className="bg-background border-border">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {DISPLAY_ROLES.map(role => (
                                <SelectItem key={role} value={role}>
                                  {role === "account_executive" ? "Account Executive" : 
                                   role === "gtm_engineer" ? "GTM Engineer" :
                                   role === "sdr_manager" ? "SDR Manager" :
                                   role === "ops_assistant" ? "Ops Assistant" :
                                   role === "talent_acquisition" ? "Talent Acquisition" :
                                   role.charAt(0).toUpperCase() + role.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedUser && (
          <DepartmentAccessModal
            open={departmentModalOpen}
            onOpenChange={setDepartmentModalOpen}
            userId={selectedUser.id}
            userName={selectedUser.full_name || selectedUser.email}
            userRole={selectedUser.role}
            onSuccess={loadUsers}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminUsers;
