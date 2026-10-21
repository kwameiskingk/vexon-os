import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Globe, Plus, RefreshCw, UserX, UserCheck, KeyRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ClientUser {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

export const PortalAccessManagement = () => {
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState({ email: '', full_name: '', company_name: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('admin-users', {
        method: 'GET',
      });

      if (response.error) throw response.error;
      
      // Filter to only show client role users
      const clientUsers = (response.data.users || []).filter(
        (u: any) => u.primary_role === 'client'
      );
      setClients(clientUsers);
    } catch (error: any) {
      toast.error('Failed to fetch clients: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = async () => {
    if (!newClient.email || !newClient.full_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setActionLoading('create');
    try {
      const response = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: {
          email: newClient.email,
          full_name: newClient.full_name,
          role: 'client',
        },
      });

      if (response.error) throw response.error;
      
      toast.success('Client portal account created. Default password: TempPassword123!');
      setCreateDialogOpen(false);
      setNewClient({ email: '', full_name: '', company_name: '' });
      fetchClients();
    } catch (error: any) {
      toast.error('Failed to create client: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      toast.success(`Client portal ${currentlyActive ? 'deactivated' : 'activated'} successfully`);
      fetchClients();
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to reset password');
      }

      toast.success('Password reset link generated');
    } catch (error: any) {
      toast.error('Failed to reset password: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>Portal Access Management</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchClients} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Client Portal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Client Portal Account</DialogTitle>
                  <DialogDescription>
                    Create a new client portal account for external access.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientEmail">Email *</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      placeholder="client@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Contact Name *</Label>
                    <Input
                      id="clientName"
                      value={newClient.full_name}
                      onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={newClient.company_name}
                      onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateClient} disabled={actionLoading === 'create'}>
                    {actionLoading === 'create' ? 'Creating...' : 'Create Account'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>Manage client portal accounts and access permissions</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No client portal accounts found
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.full_name || 'N/A'}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>
                      <Badge variant={client.is_active ? 'default' : 'destructive'}>
                        {client.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(client.id, client.is_active)}
                        disabled={actionLoading === client.id}
                        title={client.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {client.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetPassword(client.id)}
                        disabled={actionLoading === client.id}
                        title="Reset Password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
