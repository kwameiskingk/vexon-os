import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Users, Plus, RefreshCw, UserX, UserCheck, KeyRound, Search } from 'lucide-react';
import { format } from 'date-fns';
import { staffStatusOf, STAFF_STATUS_LABEL } from '@/lib/staffStatus';
import { VALID_ROLES, ValidRole } from '@/hooks/useDevRole';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  roles: string[];
  /** null = no role at all (an ended trialist, for example). */
  primary_role: string | null;
  /** Auth ban state only — NOT whether they still work here. */
  is_active: boolean;
  /** profiles.offboarded_at — the platform-wide "has left" flag (present once admin-users is redeployed). */
  offboarded_at?: string | null;
  in_trial_mode?: boolean;
  in_onboarding_mode?: boolean;
  /** setters_profiles.active — the bench flag (present once admin-users is redeployed). */
  setter_active?: boolean | null;
}

// 13 Oct (the owner): this table said CLIENT for anyone with no role and ACTIVE
// for people offboarded months ago, because the edge function defaulted the
// role to 'client' and "active" only meant "not banned". Role now comes from
// the roles array (empty = No role), status reads offboarded_at, and the list
// defaults to current accounts.
type ScopeFilter = 'current' | 'former' | 'all';
const isFormer = (u: User) => staffStatusOf(u) === "former";
// The roles array is the truth even before the function is redeployed (it never defaulted).
const roleOf = (u: User): string | null => (u.roles && u.roles.length > 0 ? u.roles[0] : null);

export const UserRoleManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'setter' as ValidRole });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>('current');
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('admin-users', {
        method: 'GET',
      });

      if (response.error) throw response.error;
      setUsers(response.data.users || []);
    } catch (error: any) {
      toast.error('Failed to fetch users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.full_name) {
      toast.error('Please fill in all fields');
      return;
    }

    setActionLoading('create');
    try {
      const response = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: newUser,
      });

      if (response.error) throw response.error;
      
      toast.success('User created successfully. Default password: TempPassword123!');
      setCreateDialogOpen(false);
      setNewUser({ email: '', full_name: '', role: 'setter' });
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to create user: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update role');
      }

      toast.success('Role updated successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to update role: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      toast.success(currentlyActive ? 'User deactivated and marked as left' : 'User reactivated');
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to update status: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to reset password');
      }

      toast.success('Password reset to: test123');
    } catch (error: any) {
      toast.error('Failed to reset password: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const visibleUsers = users
    .filter((u) => (scope === 'current' ? !isFormer(u) : scope === 'former' ? isFormer(u) : true))
    .filter((u) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (roleOf(u) || '').includes(q);
    })
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'dev': return 'destructive';
      case 'admin': return 'default';
      case 'ops': return 'secondary';
      case 'finance': return 'outline';
      case 'hr': return 'default';
      case 'accounting': return 'secondary';
      case 'csm': return 'outline';
      case 'account_executive': return 'secondary';
      case 'setter': return 'outline';
      case 'ops_assistant': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>User & Role Management</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Create a new user account with an initial role.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={newUser.full_name}
                      onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Initial Role</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as ValidRole })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VALID_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateUser} disabled={actionLoading === 'create'}>
                    {actionLoading === 'create' ? 'Creating...' : 'Create User'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>Manage user accounts and assign roles across the platform</CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or role" className="pl-8 h-9" />
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as ScopeFilter)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current ({users.filter((u) => !isFormer(u)).length})</SelectItem>
              <SelectItem value="former">Former ({users.filter(isFormer).length})</SelectItem>
              <SelectItem value="all">All ({users.length})</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{visibleUsers.length} shown</span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No accounts match.</TableCell>
                  </TableRow>
                )}
                {visibleUsers.map((user) => {
                  const role = roleOf(user);
                  return (
                  <TableRow key={user.id} className={isFormer(user) ? 'opacity-70' : undefined}>
                    <TableCell className="font-medium">
                      {user.full_name || 'N/A'}
                      {user.in_trial_mode && <Badge variant="outline" className="ml-2 text-[10px]">trial</Badge>}
                      {user.in_onboarding_mode && <Badge variant="outline" className="ml-2 text-[10px]">onboarding</Badge>}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={role ?? ''}
                        onValueChange={(v) => handleRoleChange(user.id, v)}
                        disabled={actionLoading === user.id}
                      >
                        <SelectTrigger className="w-40">
                          {role ? (
                            <Badge variant={getRoleBadgeVariant(role)}>
                              {VALID_ROLES.find(r => r.value === role)?.label || role}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No role</span>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {VALID_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {isFormer(user) ? (
                        <Badge variant="secondary" title="profiles.offboarded_at">
                          Offboarded {user.offboarded_at ? format(new Date(user.offboarded_at), 'd MMM yyyy') : ''}
                        </Badge>
                      ) : staffStatusOf(user) === 'benched' ? (
                        <Badge variant="outline" title="Setter row switched off; still with us">{STAFF_STATUS_LABEL.benched}</Badge>
                      ) : (
                        <Badge variant={user.is_active ? 'default' : 'destructive'}>
                          {user.is_active ? 'Active' : 'Banned'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (user.is_active && !window.confirm(`Deactivate ${user.full_name || user.email}? This marks them as having left Meridian (offboarded today) and blocks their login.`)) return;
                          handleToggleActive(user.id, user.is_active);
                        }}
                        disabled={actionLoading === user.id}
                        title={user.is_active ? 'Deactivate (marks as left)' : 'Reactivate'}
                      >
                        {user.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetPassword(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
