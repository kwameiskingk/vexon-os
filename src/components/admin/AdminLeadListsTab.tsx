import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, FileText, Download, Plus, X, Send, Star, PhoneCall, Clock3, CalendarCheck2, Percent } from "lucide-react";
import { subDays, format as formatDate } from "date-fns";

interface Props {
  clientId: string;
}

interface ICPProfile {
  id: string;
  status: string;
  target_industries: string[];
  target_job_titles: string[];
  target_company_sizes: string[];
  target_locations: string[];
  exclusions: string | null;
  additional_criteria: string | null;
  hiring_frequency: string | null;
  client_notes: string | null;
  admin_notes: string | null;
}

interface LeadList {
  id: string;
  name: string;
  file_url: string | null;
  file_name: string | null;
  status: string;
  client_notes: string | null;
  admin_notes: string | null;
  created_at: string;
  // Added by the lead-list tracking migration; absent until it runs.
  list_type?: string | null;
  total_contacts?: number | null;
  is_default?: boolean;
  source?: string | null;
}

interface ListMetrics {
  setterCount: number;
  booked: number;
  dials: number;
  talkSeconds: number;
  connects: number;
}

const METRICS_WINDOW_DAYS = 30;

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Needs Revision", variant: "destructive" },
};

export function AdminLeadListsTab({ clientId }: Props) {
  const [icp, setIcp] = useState<ICPProfile | null>(null);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState("");
  const [listAdminNotes, setListAdminNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Lead-list create/tracking state
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListType, setNewListType] = useState<string>("fulfilment");
  const [newListSource, setNewListSource] = useState("");
  const [newListContacts, setNewListContacts] = useState("");
  const [newListDefault, setNewListDefault] = useState(false);
  const [listMetrics, setListMetrics] = useState<Record<string, ListMetrics>>({});
  const [metricsAvailable, setMetricsAvailable] = useState(false);

  // ICP edit state (for pre-filling by CSM)
  const [editingICP, setEditingICP] = useState(false);
  const [industries, setIndustries] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState("");
  const [additionalCriteria, setAdditionalCriteria] = useState("");
  const [hiringFrequency, setHiringFrequency] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: icpData } = await supabase
        .from("client_icp_profiles")
        .select("*")
        .eq("client_profile_id", clientId)
        .maybeSingle();

      if (icpData) {
        setIcp(icpData as ICPProfile);
        setAdminNotes(icpData.admin_notes || "");
        setIndustries(icpData.target_industries || []);
        setJobTitles(icpData.target_job_titles || []);
        setCompanySizes(icpData.target_company_sizes || []);
        setLocations(icpData.target_locations || []);
        setExclusions(icpData.exclusions || "");
        setAdditionalCriteria(icpData.additional_criteria || "");
        setHiringFrequency(icpData.hiring_frequency || "");
      }

      const { data: lists } = await supabase
        .from("client_lead_lists")
        .select("*")
        .eq("client_profile_id", clientId)
        .order("created_at", { ascending: false });

      setLeadLists((lists || []) as LeadList[]);
      const notesMap: Record<string, string> = {};
      (lists || []).forEach((l: any) => { notesMap[l.id] = l.admin_notes || ""; });
      setListAdminNotes(notesMap);
      await loadListMetrics((lists || []) as LeadList[]);
    } catch (err) {
      console.error("Failed to load lead lists:", err);
    } finally {
      setLoading(false);
    }
  };

  // Per-list activity over the last 30 days, attributed via the setters
  // actively assigned to this client on each list (Close telemetry is
  // per-setter-per-day; the whole day is credited while assigned, per spec).
  const loadListMetrics = async (lists: LeadList[]) => {
    if (lists.length === 0) return;
    const windowStart = formatDate(subDays(new Date(), METRICS_WINDOW_DAYS), "yyyy-MM-dd");
    try {
      const [assignRes, meetingsRes] = await Promise.all([
        supabase
          .from("setter_client_assignments")
          .select("*")
          .eq("client_id", clientId)
          .eq("status", "active"),
        supabase
          .from("meetings")
          .select("id, setter_profile_id, created_at")
          .eq("client_profile_id", clientId)
          .eq("is_rebook", false)
          .gte("created_at", `${windowStart}T00:00:00Z`),
      ]);
      if (assignRes.error || meetingsRes.error) return;
      const assignments = (assignRes.data || []) as Array<{ setter_id: string; lead_list_id?: string | null }>;
      if (assignments.every((a) => a.lead_list_id === undefined)) {
        // Migration not applied yet — leave the strip in its "—" state.
        return;
      }

      const setterIds = [...new Set(assignments.map((a) => a.setter_id))];
      const { data: setters } = setterIds.length
        ? await supabase.from("setters_profiles").select("id, close_user_id").in("id", setterIds)
        : { data: [] };
      const closeIdBySetter = new Map(
        (setters || [])
          .map((s) => [s.id, s.close_user_id] as [string, string | null])
          .filter(([, c]) => c),
      );
      const closeIds = [...new Set([...closeIdBySetter.values()])] as string[];
      const { data: closeRows } = closeIds.length
        ? await supabase
            .from("setter_close_metrics")
            .select("close_user_id, date, dials, talk_time_seconds, connects")
            .in("close_user_id", closeIds)
            .gte("date", windowStart)
        : { data: [] };

      const metrics: Record<string, ListMetrics> = {};
      for (const list of lists) {
        // Setters explicitly on this list, plus unspecified assignments when
        // this list is the client's default.
        const listSetterIds = assignments
          .filter((a) => a.lead_list_id === list.id || (list.is_default && !a.lead_list_id))
          .map((a) => a.setter_id);
        const listCloseIds = new Set(listSetterIds.map((id) => closeIdBySetter.get(id)).filter(Boolean));
        const rows = (closeRows || []).filter((r) => listCloseIds.has(r.close_user_id));
        metrics[list.id] = {
          setterCount: listSetterIds.length,
          booked: (meetingsRes.data || []).filter((m) => listSetterIds.includes(m.setter_profile_id as string)).length,
          dials: rows.reduce((s, r) => s + Number(r.dials || 0), 0),
          talkSeconds: rows.reduce((s, r) => s + Number(r.talk_time_seconds || 0), 0),
          connects: rows.reduce((s, r) => s + Number(r.connects || 0), 0),
        };
      }
      setListMetrics(metrics);
      setMetricsAvailable(true);
    } catch {
      // Metrics are additive chrome — the approval workflow must keep working.
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error("Please name the lead list");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (newListDefault) {
        await supabase
          .from("client_lead_lists")
          .update({ is_default: false } as never)
          .eq("client_profile_id", clientId)
          .eq("is_default", true as never);
      }
      const { error } = await supabase.from("client_lead_lists").insert({
        client_profile_id: clientId,
        name: newListName.trim(),
        list_type: newListType,
        source: newListSource.trim() || null,
        total_contacts: newListContacts === "" ? null : Number(newListContacts),
        is_default: newListDefault,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        submitted_at: new Date().toISOString(),
        created_by: user?.id,
      } as never);
      if (error) throw error;
      toast.success("Lead list created");
      setCreatingList(false);
      setNewListName("");
      setNewListSource("");
      setNewListContacts("");
      setNewListDefault(false);
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create lead list";
      toast.error(message.includes("list_type") || message.includes("column")
        ? "Lead-list tracking migration not applied yet"
        : message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetListType = async (listId: string, type: string) => {
    const { error } = await supabase
      .from("client_lead_lists")
      .update({ list_type: type } as never)
      .eq("id", listId);
    if (error) toast.error(error.message);
    else loadData();
  };

  const handleMakeDefault = async (listId: string) => {
    try {
      const { error: clearErr } = await supabase
        .from("client_lead_lists")
        .update({ is_default: false } as never)
        .eq("client_profile_id", clientId)
        .eq("is_default", true as never);
      if (clearErr) throw clearErr;
      const { error } = await supabase
        .from("client_lead_lists")
        .update({ is_default: true } as never)
        .eq("id", listId);
      if (error) throw error;
      toast.success("Default lead list updated");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update default list");
    }
  };

  const handleApproveICP = async () => {
    if (!icp) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_icp_profiles").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        admin_notes: adminNotes || null,
      }).eq("id", icp.id);
      if (error) throw error;
      toast.success("ICP approved");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRejectICP = async () => {
    if (!icp || !adminNotes.trim()) {
      toast.error("Please add feedback notes before rejecting");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("client_icp_profiles").update({
        status: "rejected",
        admin_notes: adminNotes,
      }).eq("id", icp.id);
      if (error) throw error;
      toast.success("ICP sent back for revision");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveICPPrefill = async () => {
    setSaving(true);
    try {
      const payload = {
        client_profile_id: clientId,
        target_industries: industries,
        target_job_titles: jobTitles,
        target_company_sizes: companySizes,
        target_locations: locations,
        exclusions: exclusions || null,
        additional_criteria: additionalCriteria || null,
        hiring_frequency: hiringFrequency || null,
        admin_notes: adminNotes || null,
        status: "draft",
      };

      if (icp) {
        const { error } = await supabase.from("client_icp_profiles").update(payload).eq("id", icp.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_icp_profiles").insert(payload);
        if (error) throw error;
      }
      toast.success("ICP pre-filled for client");
      setEditingICP(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleListAction = async (listId: string, action: "approved" | "rejected") => {
    if (action === "rejected" && !listAdminNotes[listId]?.trim()) {
      toast.error("Please add feedback before rejecting");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_lead_lists").update({
        status: action,
        approved_at: action === "approved" ? new Date().toISOString() : null,
        approved_by: action === "approved" ? user?.id : null,
        admin_notes: listAdminNotes[listId] || null,
      }).eq("id", listId);
      if (error) throw error;
      toast.success(action === "approved" ? "Lead list approved" : "Lead list sent back for revision");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    const { data } = await supabase.storage.from("lead-list-files").createSignedUrl(fileUrl, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Failed to generate download link");
    }
  };

  const statusBadge = (status: string) => {
    const config = STATUS_BADGES[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const addToList = (field: string, setter: (v: string[]) => void, list: string[]) => {
    const val = newItem[field]?.trim();
    if (val && !list.includes(val)) {
      setter([...list, val]);
      setNewItem((p) => ({ ...p, [field]: "" }));
    }
  };

  const renderTagField = (label: string, field: string, list: string[], setter: (v: string[]) => void, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1 mb-1">
        {list.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 text-xs">
            {item}
            {editingICP && (
              <button onClick={() => setter(list.filter((_, j) => j !== i))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {list.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
      </div>
      {editingICP && (
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={newItem[field] || ""}
            onChange={(e) => setNewItem((p) => ({ ...p, [field]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList(field, setter, list))}
            className="flex-1 h-8 text-sm"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={() => addToList(field, setter, list)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* ICP Section */}
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Ideal Candidate Profile</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {icp ? "Client's ICP specification" : "Pre-fill the ICP for the client"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {icp && statusBadge(icp.status)}
            {!editingICP && (
              <Button variant="outline" size="sm" onClick={() => setEditingICP(true)}>
                {icp ? "Edit" : "Pre-fill ICP"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderTagField("Target Industries", "industries", industries, setIndustries, "e.g. SaaS")}
          {renderTagField("Target Job Titles", "jobTitles", jobTitles, setJobTitles, "e.g. VP Sales")}
          {renderTagField("Target Company Sizes", "companySizes", companySizes, setCompanySizes, "e.g. 50-200")}
          {renderTagField("Target Locations", "locations", locations, setLocations, "e.g. London")}

          {(hiringFrequency || editingICP) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Hiring Frequency</Label>
              {editingICP ? (
                <Input value={hiringFrequency} onChange={(e) => setHiringFrequency(e.target.value)} className="h-8 text-sm" />
              ) : (
                <p className="text-sm">{hiringFrequency || "—"}</p>
              )}
            </div>
          )}

          {(exclusions || editingICP) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Exclusions</Label>
              {editingICP ? (
                <Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} className="text-sm" />
              ) : (
                <p className="text-sm">{exclusions || "—"}</p>
              )}
            </div>
          )}

          {icp?.client_notes && (
            <div className="space-y-1.5">
              <Label className="text-xs">Client Notes</Label>
              <p className="text-sm bg-muted/50 rounded p-2">{icp.client_notes}</p>
            </div>
          )}

          {/* Admin notes + approve/reject */}
          {icp?.status === "submitted" && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Admin Feedback</Label>
                <Textarea
                  placeholder="Add feedback for the client..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApproveICP} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleRejectICP} disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            </>
          )}

          {editingICP && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSaveICPPrefill} disabled={saving}>
                <Send className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save ICP"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingICP(false)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead Lists Section */}
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Lead Lists</CardTitle>
            <p className="text-xs text-muted-foreground">
              Client uploads and CSM-created lists · activity attributed via assigned setters (last {METRICS_WINDOW_DAYS} days)
            </p>
          </div>
          {!creatingList && (
            <Button variant="outline" size="sm" onClick={() => setCreatingList(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Lead List
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {creatingList && (
            <div className="rounded-lg border border-primary/30 p-4 space-y-3">
              <p className="text-sm font-medium">New Lead List</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. UK SaaS Founders — March"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Type *</Label>
                  <Select value={newListType} onValueChange={setNewListType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fulfilment">Fulfilment</SelectItem>
                      <SelectItem value="acquisition">Acquisition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Source</Label>
                  <Input
                    value={newListSource}
                    onChange={(e) => setNewListSource(e.target.value)}
                    placeholder="e.g. Clay, Apollo"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Total contacts</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newListContacts}
                    onChange={(e) => setNewListContacts(e.target.value)}
                    placeholder="e.g. 1500"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="new_list_default"
                  checked={newListDefault}
                  onCheckedChange={(c) => setNewListDefault(!!c)}
                />
                <Label htmlFor="new_list_default" className="text-xs">
                  Default list for this client (new setter assignments fall back to it)
                </Label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateList} disabled={saving || !newListName.trim()}>
                  {saving ? "Creating…" : "Create Lead List"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCreatingList(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {leadLists.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No lead lists yet"
              description="Upload from the client portal or create one here with New Lead List."
            />
          ) : (
            <div className="space-y-4">
              {leadLists.map((list) => (
                <div key={list.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-sm">{list.name}</p>
                        {list.is_default && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                            <Star className="h-2.5 w-2.5 mr-0.5" /> Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(list.created_at).toLocaleDateString()}
                        {list.source ? ` · ${list.source}` : ""}
                        {list.total_contacts != null ? ` · ${list.total_contacts.toLocaleString()} contacts` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={list.list_type || "untagged"}
                        onValueChange={(v) => v !== "untagged" && handleSetListType(list.id, v)}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {!list.list_type && <SelectItem value="untagged">Set type…</SelectItem>}
                          <SelectItem value="fulfilment">Fulfilment</SelectItem>
                          <SelectItem value="acquisition">Acquisition</SelectItem>
                        </SelectContent>
                      </Select>
                      {!list.is_default && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleMakeDefault(list.id)}>
                          Make default
                        </Button>
                      )}
                      {statusBadge(list.status)}
                      {list.file_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadFile(list.file_url!, list.file_name || "file")}
                        >
                          <Download className="h-3 w-3 mr-1" /> Download
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Per-list activity strip (last 30 days via assigned setters) */}
                  {(() => {
                    const m = listMetrics[list.id];
                    const dash = "—";
                    const val = (v: string | number) => (metricsAvailable && m ? v : dash);
                    const talk = m
                      ? `${Math.floor(m.talkSeconds / 3600)}h ${Math.round((m.talkSeconds % 3600) / 60)}m`
                      : dash;
                    const connectRate =
                      m && m.dials > 0 ? `${Math.round((m.connects / m.dials) * 100)}%` : dash;
                    // the owner-approved formula: dials ÷ total contacts, capped at 100%.
                    const utilization =
                      m && list.total_contacts
                        ? `${Math.min(100, Math.round((m.dials / list.total_contacts) * 100))}%`
                        : dash;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-md bg-muted/40 border border-border/50 px-3 py-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <CalendarCheck2 className="h-3 w-3 text-muted-foreground" />
                          Booked <span className="font-semibold tabular-nums">{val(m?.booked ?? dash)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <PhoneCall className="h-3 w-3 text-muted-foreground" />
                          Dials <span className="font-semibold tabular-nums">{val(m?.dials ?? dash)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="h-3 w-3 text-muted-foreground" />
                          Talk <span className="font-semibold tabular-nums">{metricsAvailable ? talk : dash}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3 w-3 text-muted-foreground" />
                          Connect <span className="font-semibold tabular-nums">{metricsAvailable ? connectRate : dash}</span>
                        </span>
                        <span
                          className="flex items-center gap-1.5"
                          title="Dials ÷ total contacts on the list, capped at 100%"
                        >
                          Utilization (dial-based estimate){" "}
                          <span className="font-semibold tabular-nums">
                            {metricsAvailable ? utilization : dash}
                          </span>
                        </span>
                      </div>
                    );
                  })()}

                  {list.client_notes && (
                    <div className="text-sm bg-muted/50 rounded p-2">
                      <span className="font-medium text-muted-foreground">Client: </span>
                      {list.client_notes}
                    </div>
                  )}

                  {(list.status === "submitted" || list.status === "draft") && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Admin feedback..."
                        value={listAdminNotes[list.id] || ""}
                        onChange={(e) =>
                          setListAdminNotes((p) => ({ ...p, [list.id]: e.target.value }))
                        }
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleListAction(list.id, "approved")}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleListAction(list.id, "rejected")}>
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
