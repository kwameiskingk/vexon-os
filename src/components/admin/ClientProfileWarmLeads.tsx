import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ExternalLink, Flame, Plus, Loader2, Copy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { WarmLeadStatusBadge } from "@/components/warm-leads/WarmLeadStatusBadge";
import { WarmLeadStatusDropdown } from "@/components/warm-leads/WarmLeadStatusDropdown";

interface ClientProfileWarmLeadsProps {
  clientId: string;
}

interface WarmLead {
  id: string;
  full_name: string | null;
  prospect_job_title: string | null;
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  created_by_user_id: string;
  client_profile_id: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  profiles?: { full_name: string | null } | null;
}

interface UnifiedUnassignedLead {
  id: string;
  full_name: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  source: string | null;
  created_at: string;
  setter_name: string | null;
  origin: "warm_leads" | "leads";
}

export function ClientProfileWarmLeads({ clientId }: ClientProfileWarmLeadsProps) {
  const [leads, setLeads] = useState<WarmLead[]>([]);
  const [unassignedLeads, setUnassignedLeads] = useState<UnifiedUnassignedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    loadLeads();
  }, [clientId]);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("warm_leads")
        .select("*")
        .eq("client_profile_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch setter names separately
      const userIds = [...new Set((data || []).map(d => d.created_by_user_id).filter(Boolean))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || ""]));
      }

      setLeads((data || []).map(d => ({ ...d, profiles: { full_name: profileMap[d.created_by_user_id] || null } })));
    } catch (err) {
      console.error("Failed to load warm leads:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnassignedLeads = async () => {
    const unified: UnifiedUnassignedLead[] = [];

    // 1. Enriched warm leads (warm_leads table) with no client assignment
    const { data: warmData } = await supabase
      .from("warm_leads")
      .select("*")
      .is("client_profile_id", null)
      .order("created_at", { ascending: false });

    // Fetch setter names for warm leads
    const warmUserIds = [...new Set((warmData || []).map(d => d.created_by_user_id).filter(Boolean))];
    let warmProfileMap: Record<string, string> = {};
    if (warmUserIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", warmUserIds);
      warmProfileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || ""]));
    }

    (warmData || []).forEach((wl: any) => {
      unified.push({
        id: wl.id,
        full_name: wl.full_name,
        company_name: wl.company_name,
        linkedin_url: wl.linkedin_url,
        source: wl.source || "enriched",
        created_at: wl.created_at,
        setter_name: warmProfileMap[wl.created_by_user_id] || null,
        origin: "warm_leads",
      });
    });

    // 2. Manual warm leads (leads table) with no client assignment
    const { data: manualData } = await supabase
      .from("leads")
      .select("*")
      .is("assigned_client_id", null)
      .order("created_at", { ascending: false });

    // Fetch setter names for manual leads
    const manualUserIds = [...new Set((manualData || []).map(d => d.setter_id).filter(Boolean))];
    let manualProfileMap: Record<string, string> = {};
    if (manualUserIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", manualUserIds);
      manualProfileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || ""]));
    }

    (manualData || []).forEach((ml: any) => {
      unified.push({
        id: ml.id,
        full_name: ml.contact_name,
        company_name: ml.company_name,
        linkedin_url: ml.linkedin_url,
        source: ml.source || "manual",
        created_at: ml.created_at,
        setter_name: manualProfileMap[ml.setter_id] || null,
        origin: "leads",
      });
    });

    // Sort by date descending
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setUnassignedLeads(unified);
  };

  const handleOpenAssignModal = () => {
    setSelectedLeadIds(new Set());
    loadUnassignedLeads();
    setShowAssignModal(true);
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedLeadIds.size === 0) return;
    setAssigning(true);

    const selectedIds = Array.from(selectedLeadIds);
    const warmLeadIds = unassignedLeads.filter(l => selectedIds.includes(l.id) && l.origin === "warm_leads").map(l => l.id);
    const manualLeadIds = unassignedLeads.filter(l => selectedIds.includes(l.id) && l.origin === "leads").map(l => l.id);

    let firstError: string | null = null;

    // Assign enriched leads directly
    if (warmLeadIds.length > 0) {
      const { error } = await supabase
        .from("warm_leads")
        .update({ client_profile_id: clientId, approval_status: "pending" })
        .in("id", warmLeadIds);
      if (error) firstError = firstError ?? error.message;
    }

    // For manual leads: copy into warm_leads table with client assignment, then mark the original
    if (manualLeadIds.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const manualLeadData = unassignedLeads.filter(l => manualLeadIds.includes(l.id) && l.origin === "leads");

      // Get full data from leads table for these IDs
      const { data: fullManualLeads } = await supabase
        .from("leads")
        .select("*")
        .in("id", manualLeadIds);

      if (fullManualLeads && fullManualLeads.length > 0) {
        const insertRows = fullManualLeads.map(ml => ({
          // Attribute to the original setter when one exists; leads whose
          // setter was purged fall back to the assigning user (the column is
          // NOT NULL and these are exactly the leads being rescued).
          created_by_user_id: ml.setter_id ?? user?.id,
          full_name: ml.contact_name,
          prospect_job_title: ml.prospect_job_title || null,
          company_name: ml.company_name,
          company_domain: ml.company_website || null,
          linkedin_url: ml.linkedin_url || "",
          email: ml.email || null,
          phone: ml.mobile || null,
          source: ml.source || "manual",
          client_profile_id: clientId,
          approval_status: "pending",
        }));

        const { error: insertError } = await supabase
          .from("warm_leads")
          .insert(insertRows);

        if (insertError) {
          firstError = firstError ?? insertError.message;
        } else {
          // Mark original leads as assigned
          await supabase
            .from("leads")
            .update({ assigned_client_id: clientId })
            .in("id", manualLeadIds);
        }
      }
    }

    setAssigning(false);
    if (firstError) {
      // The real Postgres/RLS message — "Some leads failed" hid the actual
      // cause (missing INSERT policy) for weeks.
      toast.error(`Some leads failed to assign: ${firstError}`);
    } else {
      toast.success(`${selectedIds.length} warm lead(s) assigned`);
    }
    setShowAssignModal(false);
    loadLeads();
  };

  const handleApprove = async (leadId: string) => {
    setProcessingId(leadId);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("warm_leads")
      .update({
        approval_status: "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    setProcessingId(null);
    if (error) {
      toast.error("Failed to approve lead");
      return;
    }
    toast.success("Warm lead approved — now visible in client portal");
    loadLeads();
  };

  const handleReject = async (leadId: string) => {
    setProcessingId(leadId);

    const { error } = await supabase
      .from("warm_leads")
      .update({ approval_status: "rejected" })
      .eq("id", leadId);

    setProcessingId(null);
    if (error) {
      toast.error("Failed to reject lead");
      return;
    }
    toast.success("Warm lead rejected");
    loadLeads();
  };

  const handleUnassign = async (leadId: string) => {
    setProcessingId(leadId);

    const { error } = await supabase
      .from("warm_leads")
      .update({ client_profile_id: null, approval_status: "pending", approved_by: null, approved_at: null })
      .eq("id", leadId);

    setProcessingId(null);
    if (error) {
      toast.error("Failed to unassign lead");
      return;
    }
    toast.success("Warm lead unassigned from client");
    loadLeads();
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const filteredLeads = filterStatus === "all"
    ? leads
    : leads.filter(l => l.approval_status === filterStatus);

  const pendingCount = leads.filter(l => l.approval_status === "pending").length;
  const approvedCount = leads.filter(l => l.approval_status === "approved").length;
  const rejectedCount = leads.filter(l => l.approval_status === "rejected").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Warm Leads</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">{pendingCount} pending</Badge>
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">{approvedCount} approved</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({leads.length})</SelectItem>
              <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
              <SelectItem value="approved">Approved ({approvedCount})</SelectItem>
              <SelectItem value="rejected">Rejected ({rejectedCount})</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleOpenAssignModal}>
            <Plus className="h-4 w-4 mr-1" />
            Assign Leads
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
             <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Logged By</TableHead>
                <TableHead>Lead Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium text-sm">{lead.full_name || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.company_name || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {lead.linkedin_url ? (
                      <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                        Profile <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.phone ? (
                      <span className="inline-flex items-center gap-1">
                        {lead.phone}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleCopy(lead.phone!, "Phone")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy</TooltipContent>
                        </Tooltip>
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(lead.profiles as any)?.full_name || "—"}
                  </TableCell>
                  <TableCell>
                    <WarmLeadStatusDropdown
                      warmLeadId={lead.id}
                      currentStatus={(lead as any).lead_status || "new"}
                      onUpdated={loadLeads}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{lead.source || "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(lead.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>{getStatusBadge(lead.approval_status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {lead.approval_status === "pending" && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                onClick={() => handleApprove(lead.id)}
                                disabled={processingId === lead.id}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Approve — visible to client</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleReject(lead.id)}
                                disabled={processingId === lead.id}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reject</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      {lead.approval_status === "rejected" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                              onClick={() => handleApprove(lead.id)}
                              disabled={processingId === lead.id}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve instead</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => handleUnassign(lead.id)}
                            disabled={processingId === lead.id}
                          >
                            Unassign
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove from this client</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState
                      icon={Flame}
                      title="No warm leads"
                      description={filterStatus === "all"
                        ? "Click 'Assign Leads' to assign warm leads from the setter pool to this client."
                        : `No ${filterStatus} warm leads for this client.`}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assign Leads Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Warm Leads to Client</DialogTitle>
            <DialogDescription>
              Select unassigned warm leads (enriched and manual) to assign to this client. They will start as "Pending" until you approve them.
            </DialogDescription>
          </DialogHeader>

          {unassignedLeads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No unassigned warm leads available. All warm leads have already been assigned to clients.
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground mb-2">
                {selectedLeadIds.size} of {unassignedLeads.length} selected
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Logged By</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassignedLeads.map((lead) => (
                    <TableRow
                      key={`${lead.origin}-${lead.id}`}
                      className={`cursor-pointer transition-colors ${selectedLeadIds.has(lead.id) ? "bg-primary/5" : ""}`}
                      onClick={() => toggleLeadSelection(lead.id)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          className="rounded border-border"
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">{lead.full_name || "—"}</TableCell>
                      <TableCell className="text-sm">{lead.company_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.setter_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{lead.source || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(lead.created_at), "dd MMM yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancel</Button>
                <Button onClick={handleAssign} disabled={selectedLeadIds.size === 0 || assigning}>
                  {assigning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Assign {selectedLeadIds.size > 0 ? `(${selectedLeadIds.size})` : ""}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
