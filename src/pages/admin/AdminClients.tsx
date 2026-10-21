import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STANDARD_COUNTRIES } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHealthColorClasses } from "@/lib/clientHealth";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Client {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  industry: string | null;
  country: string | null;
  status?: string;
  logo?: string;
  team_network_member?: boolean;
  created_at: string;
  health_override?: string | null;
}

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  status: string;
  meetings_booked: number;
  meeting_target: number;
  calls_outbound: number;
  call_target: number;
  meetings_sat: number;
  launch_date: string | null;
  end_date: string | null;
}

interface ClientWithHealth extends Client {
  campaigns: Campaign[];
  activeCampaigns: number;
  meetingsLast7Days: number;
  assignedAE: string | null;
  healthIndicator: 'green' | 'amber' | 'red';
  healthLabel: string;
}

const AdminClients = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCSMRoute = location.pathname.startsWith('/csm');
  const [clients, setClients] = useState<ClientWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    company_website: "",
    contact_name: "",
    email: "",
    mobile: "",
    industry: "",
    company_size: "",
    country: [] as string[],
  });

  useEffect(() => {
    loadClientsWithHealth();
  }, []);

  const loadClientsWithHealth = async () => {
    setLoading(true);
    try {
      // Load all clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("client_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (clientsError) throw clientsError;

      // Load all campaigns
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("*");

      // Dynamic health signals (same as CSM Dashboard & Client Health)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: activeAssignments } = await supabase
        .from('setter_client_assignments')
        .select('client_id')
        .eq('status', 'active');
      const { data: rosterAssignments } = await supabase
        .from('roster_entries')
        .select('client_profile_id')
        .gte('roster_date', thirtyDaysAgoStr);
      const assignedClientIds = new Set([
        ...(activeAssignments?.map(a => a.client_id) || []),
        ...(rosterAssignments?.map(r => r.client_profile_id).filter(Boolean) || []),
      ]);

      const { data: recentMeetings } = await supabase
        .from("meetings")
        .select("client_profile_id, meeting_date")
        .gte("meeting_date", thirtyDaysAgoStr);

      const meetingClientIds = new Set(
        recentMeetings?.map(m => m.client_profile_id).filter(Boolean) || []
      );

      // Count meetings per client in last 7 days for display
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const meetingCounts: Record<string, number> = {};
      recentMeetings?.forEach(m => {
        if (m.client_profile_id && m.meeting_date >= sevenDaysAgo.toISOString().split('T')[0]) {
          meetingCounts[m.client_profile_id] = (meetingCounts[m.client_profile_id] || 0) + 1;
        }
      });

      const activeCampaignClientIds = new Set(
        campaignsData?.filter(c => c.status === 'active').map(c => c.client_id) || []
      );

      // Build enriched client list using dynamic health
      const enrichedClients: ClientWithHealth[] = (clientsData || []).map(client => {
        const clientCampaigns = campaignsData?.filter(c => c.client_id === client.id) || [];
        const activeCampaigns = clientCampaigns.filter(c => c.status === 'active').length;
        const meetingsLast7Days = meetingCounts[client.id] || 0;

        // Dynamic health: same 3-signal logic as CSM Dashboard & Client Health
        const hasActiveCampaigns = activeCampaignClientIds.has(client.id);
        const hasAssignedSetters = assignedClientIds.has(client.id);
        const hasRecentMeetings = meetingClientIds.has(client.id);

        let healthIndicator: 'green' | 'amber' | 'red';
        let healthLabel: string;

        // Apply overrides first
        if (client.health_override === 'healthy') {
          healthIndicator = 'green';
          healthLabel = 'Healthy';
        } else if (client.health_override === 'at_risk') {
          healthIndicator = 'red';
          healthLabel = 'At Risk';
        } else {
          const signals = [hasActiveCampaigns, hasAssignedSetters, hasRecentMeetings];
          const activeSignals = signals.filter(Boolean).length;

          if (activeSignals >= 2) {
            healthIndicator = 'green';
            healthLabel = 'Healthy';
          } else if (activeSignals === 1) {
            healthIndicator = 'amber';
            healthLabel = 'Needs Attention';
          } else {
            healthIndicator = 'red';
            healthLabel = 'At Risk';
          }
        }

        return {
          ...client,
          campaigns: clientCampaigns,
          activeCampaigns,
          meetingsLast7Days,
          assignedAE: null,
          healthIndicator,
          healthLabel
        };
      });

      setClients(enrichedClients);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submissionData = {
      company_name: formData.company_name,
      contact_name: formData.contact_name,
      email: formData.email,
      phone: formData.mobile,
      website: formData.company_website,
      industry: formData.industry,
      size: formData.company_size,
      country: formData.country.join(", "),
      status: 'active' as const
    };
    const { error } = await supabase.from("client_profiles").insert([submissionData]);

    if (error) {
      toast.error("Failed to add client");
    } else {
      toast.success("Client added successfully");
      setOpen(false);
      setFormData({
        company_name: "",
        company_website: "",
        contact_name: "",
        email: "",
        mobile: "",
        industry: "",
        company_size: "",
        country: [],
      });
      loadClientsWithHealth();
    }
  };

  const toggleCountry = (country: string) => {
    setFormData(prev => ({
      ...prev,
      country: prev.country.includes(country)
        ? prev.country.filter(c => c !== country)
        : [...prev.country, country]
    }));
  };

  const getStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case 'pending':
        return { className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Pending" };
      case 'inactive':
        return { className: "bg-gray-500/20 text-gray-400 border-gray-500/30", label: "Inactive" };
      case 'active':
      default:
        return { className: "bg-green-500/20 text-green-400 border-green-500/30", label: "Active" };
    }
  };

  const handleDeleteClient = async () => {
    if (!deleteClientId) return;
    
    setDeleting(true);
    try {
      // Delete client profile (cascades to related records)
      const { error } = await supabase
        .from("client_profiles")
        .delete()
        .eq("id", deleteClientId);

      if (error) throw error;

      toast.success("Client deleted successfully");
      setClients(prev => prev.filter(c => c.id !== deleteClientId));
      setDeleteClientId(null);
    } catch (error: any) {
      console.error("Error deleting client:", error);
      toast.error(error.message || "Failed to delete client");
    } finally {
      setDeleting(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || client.status === statusFilter;
    const matchesHealth = healthFilter === "all" || client.healthIndicator === healthFilter;
    
    return matchesSearch && matchesStatus && matchesHealth;
  });

  // Summary stats
  const healthStats = {
    green: clients.filter(c => c.healthIndicator === 'green').length,
    amber: clients.filter(c => c.healthIndicator === 'amber').length,
    red: clients.filter(c => c.healthIndicator === 'red').length,
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Clients"
          subtitle="Unified client fulfilment and health overview"
          actions={
            <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90 shadow-glow">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          }
        />

        {/* Health Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setHealthFilter(healthFilter === 'green' ? 'all' : 'green')}
            className={`p-4 rounded-lg border transition-all ${
              healthFilter === 'green' 
                ? 'bg-green-500/20 border-green-500/50' 
                : 'bg-card border-border hover:border-green-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Healthy</span>
              <div className="h-2 w-2 rounded-full bg-green-500" />
            </div>
            <p className="text-3xl font-bold text-green-400 mt-1">{healthStats.green}</p>
          </button>
          
          <button
            onClick={() => setHealthFilter(healthFilter === 'amber' ? 'all' : 'amber')}
            className={`p-4 rounded-lg border transition-all ${
              healthFilter === 'amber' 
                ? 'bg-amber-500/20 border-amber-500/50' 
                : 'bg-card border-border hover:border-amber-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Needs Attention</span>
              <div className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <p className="text-3xl font-bold text-amber-400 mt-1">{healthStats.amber}</p>
          </button>
          
          <button
            onClick={() => setHealthFilter(healthFilter === 'red' ? 'all' : 'red')}
            className={`p-4 rounded-lg border transition-all ${
              healthFilter === 'red' 
                ? 'bg-red-500/20 border-red-500/50' 
                : 'bg-card border-border hover:border-red-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">At Risk</span>
              <div className="h-2 w-2 rounded-full bg-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-400 mt-1">{healthStats.red}</p>
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {healthFilter !== 'all' && (
            <Button variant="outline" size="sm" onClick={() => setHealthFilter('all')}>
              Clear Health Filter
            </Button>
          )}
        </div>

        {/* Clients Table */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredClients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients found"
            description={searchQuery || statusFilter !== 'all' || healthFilter !== 'all' 
              ? "Try adjusting your filters" 
              : "Add your first client to get started"}
            action={
              !searchQuery && statusFilter === 'all' && healthFilter === 'all' 
                ? { label: "Add Client", onClick: () => setOpen(true) }
                : undefined
            }
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[250px]">Client</TableHead>
                  <TableHead className="w-[100px]">Health</TableHead>
                  <TableHead className="w-[120px]">Campaigns</TableHead>
                  <TableHead className="w-[140px]">Meetings (7d)</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[150px]">Industry</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const healthColors = getHealthColorClasses(client.healthIndicator);
                  const statusBadge = getStatusBadge(client.status);
                  
                  return (
                    <TableRow 
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(isCSMRoute ? `/csm/clients/${client.id}` : `/admin/clients/${client.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {client.logo ? (
                            <img 
                              src={client.logo} 
                              alt={client.company_name} 
                              className="h-9 w-9 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-md bg-primary/20 flex items-center justify-center">
                              <span className="text-sm font-semibold text-primary">
                                {client.company_name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{client.company_name}</p>
                            <p className="text-xs text-muted-foreground">{client.contact_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${healthColors.bg} ${healthColors.border} border`}>
                          <div className={`h-2 w-2 rounded-full ${healthColors.dot}`} />
                          <span className={`text-xs font-medium ${healthColors.text}`}>
                            {client.healthLabel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{client.activeCampaigns}</span>
                          <span className="text-muted-foreground text-xs">active</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${client.meetingsLast7Days === 0 ? 'text-muted-foreground' : ''}`}>
                          {client.meetingsLast7Days}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusBadge.className}`}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {client.industry || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteClientId(client.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add Client Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Enter client information below</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_website">Company Website</Label>
                  <Input
                    id="company_website"
                    value={formData.company_website}
                    onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact Name *</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile</Label>
                  <Input
                    id="mobile"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_size">Company Size</Label>
                  <Input
                    id="company_size"
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country/Region</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        {formData.country.length > 0 
                          ? `${formData.country.length} selected` 
                          : "Select countries..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-4" align="start">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Select countries/regions</p>
                        {STANDARD_COUNTRIES.map((country) => (
                          <div key={country} className="flex items-center space-x-2">
                            <Checkbox
                              id={country}
                              checked={formData.country.includes(country)}
                              onCheckedChange={() => toggleCountry(country)}
                            />
                            <label
                              htmlFor={country}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {country}
                            </label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {formData.country.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {formData.country.map((country) => (
                        <Badge key={country} variant="secondary" className="text-xs">
                          {country}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  Add Client
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteClientId} onOpenChange={(open) => !open && setDeleteClientId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Client</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this client? This action cannot be undone and will remove all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteClient}
                disabled={deleting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminClients;
