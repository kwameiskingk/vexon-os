import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Flame, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WarmLeadStatusBadge } from "@/components/warm-leads/WarmLeadStatusBadge";
import { WarmLeadStatusDropdown } from "@/components/warm-leads/WarmLeadStatusDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface UnifiedLead {
  id: string;
  full_name: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  setter_name: string | null;
  setter_id: string | null;
  client_name: string | null;
  client_id: string | null;
  lead_status: string;
  approval_status: string;
  assigned_setter_name: string | null;
  assigned_setter_id: string | null;
  origin: "warm_leads" | "leads";
}

const OperationsWarmLeads = () => {
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [showAssignSetterModal, setShowAssignSetterModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<UnifiedLead | null>(null);
  const [setters, setSetters] = useState<{ id: string; user_id: string; full_name: string }[]>([]);
  const [assigningSetter, setAssigningSetter] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const unified: UnifiedLead[] = [];

      // 1. Warm leads (enriched) — no FK joins, fetch profiles separately
      const { data: warmData } = await supabase
        .from("warm_leads")
        .select("*")
        .order("created_at", { ascending: false });

      // Collect user IDs for profile lookups
      const warmUserIds = new Set<string>();
      const clientIds = new Set<string>();

      (warmData || []).forEach((wl: any) => {
        if (wl.created_by_user_id) warmUserIds.add(wl.created_by_user_id);
        if (wl.assigned_setter_id) warmUserIds.add(wl.assigned_setter_id);
        if (wl.client_profile_id) clientIds.add(wl.client_profile_id);
      });

      // 2. Manual leads
      const { data: manualData } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      (manualData || []).forEach((ml: any) => {
        if (ml.setter_id) warmUserIds.add(ml.setter_id);
        if (ml.assigned_setter_id) warmUserIds.add(ml.assigned_setter_id);
        if (ml.assigned_client_id) clientIds.add(ml.assigned_client_id);
      });

      // Batch fetch profiles
      let profileMap: Record<string, string> = {};
      const userIdArr = Array.from(warmUserIds);
      if (userIdArr.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIdArr);
        profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || "Unknown"]));
      }

      // Batch fetch client names
      let clientMap: Record<string, string> = {};
      const clientIdArr = Array.from(clientIds);
      if (clientIdArr.length > 0) {
        const { data: clients } = await supabase
          .from("client_profiles")
          .select("id, company_name")
          .in("id", clientIdArr);
        clientMap = Object.fromEntries((clients || []).map(c => [c.id, c.company_name || "Unknown"]));
      }

      // Build unified warm leads
      (warmData || []).forEach((wl: any) => {
        unified.push({
          id: wl.id,
          full_name: wl.full_name,
          company_name: wl.company_name,
          linkedin_url: wl.linkedin_url,
          phone: wl.phone,
          source: wl.source || "enriched",
          created_at: wl.created_at,
          setter_name: wl.created_by_user_id ? profileMap[wl.created_by_user_id] || null : null,
          setter_id: wl.created_by_user_id,
          client_name: wl.client_profile_id ? clientMap[wl.client_profile_id] || null : null,
          client_id: wl.client_profile_id,
          lead_status: wl.lead_status || "new",
          approval_status: wl.approval_status || "pending",
          assigned_setter_name: wl.assigned_setter_id ? profileMap[wl.assigned_setter_id] || null : null,
          assigned_setter_id: wl.assigned_setter_id,
          origin: "warm_leads",
        });
      });

      // Build unified manual leads (skip duplicates already in warm_leads)
      (manualData || []).forEach((ml: any) => {
        if (ml.assigned_client_id && unified.some(u => u.full_name === ml.contact_name && u.company_name === ml.company_name)) {
          return;
        }
        unified.push({
          id: ml.id,
          full_name: ml.contact_name,
          company_name: ml.company_name,
          linkedin_url: ml.linkedin_url,
          phone: ml.mobile,
          source: ml.source || "manual",
          created_at: ml.created_at,
          setter_name: ml.setter_id ? profileMap[ml.setter_id] || null : null,
          setter_id: ml.setter_id,
          client_name: ml.assigned_client_id ? clientMap[ml.assigned_client_id] || null : null,
          client_id: ml.assigned_client_id,
          lead_status: ml.status || "new",
          approval_status: "n/a",
          assigned_setter_name: ml.assigned_setter_id ? profileMap[ml.assigned_setter_id] || null : null,
          assigned_setter_id: ml.assigned_setter_id,
          origin: "leads",
        });
      });

      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setLeads(unified);
    } catch (err) {
      console.error("Failed to load warm leads:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const openAssignSetter = async (lead: UnifiedLead) => {
    setSelectedLead(lead);
    // Load active setters
    const { data } = await supabase
      .from("setters_profiles")
      .select("id, user_id, full_name")
      .eq("active", true)
        .eq("is_test_account", false)
      .neq("department", "sales") // AE telemetry rows, not assignable setters
      .order("full_name");
    setSetters(data || []);
    setShowAssignSetterModal(true);
  };

  const handleAssignSetter = async (setterUserId: string) => {
    if (!selectedLead) return;
    setAssigningSetter(true);

    try {
      if (selectedLead.origin === "warm_leads") {
        const { error } = await supabase
          .from("warm_leads")
          .update({ assigned_setter_id: setterUserId })
          .eq("id", selectedLead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("leads")
          .update({ assigned_setter_id: setterUserId })
          .eq("id", selectedLead.id);
        if (error) throw error;
      }

      toast({ title: "Setter assigned", description: "Lead has been assigned to the setter for follow-up." });
      setShowAssignSetterModal(false);
      loadLeads();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigningSetter(false);
    }
  };

  const filteredLeads = filter === "all"
    ? leads
    : filter === "unassigned"
    ? leads.filter((l) => !l.client_name)
    : filter === "assigned"
    ? leads.filter((l) => !!l.client_name)
    : leads;

  const unassignedCount = leads.filter((l) => !l.client_name).length;

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <PageHeader title="Warm Leads" subtitle="All warm leads from setters — enriched and manual" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Warm Leads"
          subtitle="All warm leads from setters — enriched and manual"
        />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{leads.length} total</Badge>
            <Badge variant="secondary">{unassignedCount} unassigned</Badge>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Logged By</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Lead Status</TableHead>
                  <TableHead>Assigned Setter</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={`${lead.origin}-${lead.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.setter_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{lead.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">{lead.company_name || "—"}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Profile
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {lead.phone ? (
                        <span className="inline-flex items-center gap-1">
                          {lead.phone}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(lead.phone!, "Phone")}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy phone</TooltipContent>
                          </Tooltip>
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {lead.origin === "warm_leads" ? (
                        <WarmLeadStatusDropdown
                          warmLeadId={lead.id}
                          currentStatus={lead.lead_status}
                          onUpdated={loadLeads}
                        />
                      ) : (
                        <WarmLeadStatusBadge status={lead.lead_status} />
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.assigned_setter_name ? (
                        <Badge variant="outline" className="text-xs">{lead.assigned_setter_name}</Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => openAssignSetter(lead)}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Assign to setter</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.client_name ? (
                        <Badge variant="outline" className="text-xs">{lead.client_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{lead.source || "—"}</TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <EmptyState
                        icon={Flame}
                        title="No warm leads yet"
                        description="Warm leads submitted by setters will appear here."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Assign to Setter Modal */}
        <Dialog open={showAssignSetterModal} onOpenChange={setShowAssignSetterModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Lead to Setter</DialogTitle>
              <DialogDescription>
                Select a setter to follow up on "{selectedLead?.full_name || selectedLead?.company_name || "this lead"}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {setters.map((setter) => (
                <Button
                  key={setter.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={assigningSetter}
                  onClick={() => handleAssignSetter(setter.user_id)}
                >
                  {setter.full_name || setter.user_id}
                </Button>
              ))}
              {setters.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No active setters found.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

export default OperationsWarmLeads;
