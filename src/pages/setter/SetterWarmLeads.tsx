import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill } from "@/components/ui-v2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit, Trash2, Users, ExternalLink, Copy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export type WarmLeadForm = {
  contact_name: string; company_name: string; prospect_job_title: string; email: string; mobile: string;
  linkedin_url: string; company_website: string; callback_date: string; callback_time: string;
  source: string; industry: string; notes: string; close_lead_id: string;
};

/** What the Close lookup hands back (booking-public close_lead). */
export interface CloseLeadFill {
  contact_name: string | null;
  contact_title: string | null;
  mobile: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_website: string | null;
  industry: string | null;
}

export interface SetterWarmLeadsViewProps {
  leads: any[];
  enrichedLeads: any[];
  /** Fill the form from a Close lead link. Absent on the demo surface. */
  onLookupClose?: (link: string) => Promise<CloseLeadFill | { error: string }>;
  /** Persist a manual lead (insert when editingId is null). Resolves true on success. */
  onSaveLead: (payload: WarmLeadForm & { callback_date: string | null; callback_time: string | null }, editingId: string | null) => Promise<boolean>;
  /** Resolves true on success. */
  onDeleteLead: (id: string, kind: "manual" | "enriched") => Promise<boolean>;
}

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures). All dialog/form state lives here;
 * persistence comes in through the two callbacks.
 */
export const SetterWarmLeadsView = ({ leads, enrichedLeads, onLookupClose, onSaveLead, onDeleteLead }: SetterWarmLeadsViewProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [closeLookup, setCloseLookup] = useState<{ status: "idle" | "looking" | "found" | "failed"; error?: string }>({ status: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; kind: "manual" | "enriched" } | null>(null);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    contact_name: "", company_name: "", prospect_job_title: "", email: "", mobile: "",
    linkedin_url: "", company_website: "", callback_date: "",
    callback_time: "", source: "", industry: "", notes: "", close_lead_id: "",
  });

  const emptyForm = { contact_name: "", company_name: "", prospect_job_title: "", email: "", mobile: "", linkedin_url: "", company_website: "", callback_date: "", callback_time: "", source: "", industry: "", notes: "", close_lead_id: "" };

  const openAdd = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsOpen(true);
  };

  const openEdit = (lead: any) => {
    setEditingId(lead.id);
    setFormData({
      contact_name: lead.contact_name ?? "",
      company_name: lead.company_name ?? "",
      prospect_job_title: lead.prospect_job_title ?? "",
      email: lead.email ?? "",
      mobile: lead.mobile ?? "",
      linkedin_url: lead.linkedin_url ?? "",
      company_website: lead.company_website ?? "",
      callback_date: lead.callback_date ?? "",
      callback_time: lead.callback_time ?? "",
      source: lead.source ?? "",
      industry: lead.industry ?? "",
      notes: lead.notes ?? "",
      close_lead_id: lead.close_lead_id ?? "",
    });
    setIsOpen(true);
  };

  const fillFromClose = async () => {
    if (!onLookupClose) return;
    const link = formData.close_lead_id.trim();
    if (!link) return;
    setCloseLookup({ status: "looking" });
    const res = await onLookupClose(link);
    if ("error" in res) { setCloseLookup({ status: "failed", error: res.error }); return; }
    setFormData((f) => ({
      ...f,
      contact_name: res.contact_name || f.contact_name,
      prospect_job_title: res.contact_title || f.prospect_job_title,
      mobile: res.mobile || f.mobile,
      linkedin_url: res.linkedin_url || f.linkedin_url,
      company_name: res.company_name || f.company_name,
      company_website: res.company_website || f.company_website,
      industry: res.industry || f.industry,
    }));
    setCloseLookup({ status: "found" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      // Warm leads are marked in Close and brought here by link, so the
      // source is always the call (12 Oct). The link itself is the Close id.
      source: formData.source || "Cold Call",
      callback_date: formData.callback_date || null,
      callback_time: formData.callback_time || null,
    };
    const ok = await onSaveLead(payload, editingId);
    if (ok) {
      toast({ title: "Success", description: editingId ? "Warm lead updated." : "Warm lead added successfully!" });
      setIsOpen(false);
      setEditingId(null);
      setFormData(emptyForm);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ok = await onDeleteLead(deleteTarget.id, deleteTarget.kind);
    if (ok) toast({ title: "Deleted", description: "Lead removed." });
    setDeleteTarget(null);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader title="Warm Leads" subtitle="Leads worth calling back, yours to keep warm"
          actions={
            <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) { setEditingId(null); setFormData(emptyForm); } }}>
              <ButtonV2 variant="primary" onClick={openAdd}>Add warm lead</ButtonV2>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? "Edit Warm Lead" : "Add Warm Lead"}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {onLookupClose && (
                    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <Label>Close lead link</Label>
                      <div className="flex gap-2">
                        <Input type="url" placeholder="https://app.close.com/lead/..." value={formData.close_lead_id}
                          onChange={(e) => { setFormData({ ...formData, close_lead_id: e.target.value }); setCloseLookup({ status: "idle" }); }} />
                        <Button type="button" variant="secondary" disabled={!formData.close_lead_id.trim() || closeLookup.status === "looking"} onClick={fillFromClose}>
                          {closeLookup.status === "looking" ? "Looking…" : "Fill from Close"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {closeLookup.status === "found" && "Filled from Close. Check the details and add the email yourself."}
                        {closeLookup.status === "failed" && (closeLookup.error || "Lead not found.")}
                        {(closeLookup.status === "idle" || closeLookup.status === "looking") && "Paste the lead you marked as warm in Close to fill the form."}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Contact Name *</Label><Input required value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} /></div>
                    <div><Label>Company Name *</Label><Input required value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} /></div>
                    <div><Label>Prospect Job Title</Label><Input value={formData.prospect_job_title} onChange={(e) => setFormData({ ...formData, prospect_job_title: e.target.value })} placeholder="e.g. Head of Talent" /></div>
                    <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                    <div><Label>Mobile</Label><Input value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} /></div>
                    <div><Label>LinkedIn URL</Label><Input value={formData.linkedin_url} onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })} /></div>
                    <div><Label>Company Website</Label><Input value={formData.company_website} onChange={(e) => setFormData({ ...formData, company_website: e.target.value })} /></div>
                    <div><Label>Callback Date</Label><Input type="date" value={formData.callback_date} className="[color-scheme:dark]" onChange={(e) => setFormData({ ...formData, callback_date: e.target.value })} /></div>
                    <div><Label>Callback Time</Label><Input type="time" value={formData.callback_time} className="[color-scheme:dark]" onChange={(e) => setFormData({ ...formData, callback_time: e.target.value })} /></div>
                    <div><Label>Industry</Label><Input value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} placeholder="Filled from Close when it is there" /></div>
                  </div>
                  <div><Label>Notes</Label><Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full">{editingId ? "Save Changes" : "Add Lead"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          }
        />
        <div className="space-y-5">
          {enrichedLeads.length > 0 && (
            <Panel title="Enriched leads" aside={<Pill>{enrichedLeads.length}</Pill>}>
                <Table><TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>LinkedIn URL</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader><TableBody>
                  {enrichedLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate"><a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{lead.linkedin_url.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}<ExternalLink className="h-3 w-3" /></a></TableCell>
                      <TableCell>{lead.phone ? <span className="inline-flex items-center gap-1">{lead.phone}<Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(lead.phone, "Phone")}><Copy className="h-3 w-3" /></Button></span> : "—"}</TableCell>
                      <TableCell>{lead.email ? <span className="inline-flex items-center gap-1">{lead.email}<Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(lead.email, "Email")}><Copy className="h-3 w-3" /></Button></span> : "—"}</TableCell>
                      <TableCell className="text-xs">{lead.source || "—"}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: lead.id, kind: "enriched" })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
            </Panel>
          )}
          <Panel title="Manual leads" aside={<Pill>{leads.length}</Pill>}>
              <Table><TableHeader><TableRow>
                <TableHead>Company Name</TableHead><TableHead>Contact Name</TableHead><TableHead>Email</TableHead><TableHead>Phone Number</TableHead><TableHead>Close Lead</TableHead><TableHead>Follow-Up Date</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader><TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.company_name}</TableCell>
                    <TableCell>{lead.contact_name}</TableCell>
                    <TableCell>{lead.email || "N/A"}</TableCell>
                    <TableCell>{lead.mobile || "N/A"}</TableCell>
                    <TableCell>
                      {lead.close_lead_id ? (
                        <a
                          href={lead.close_lead_id.startsWith("http") ? lead.close_lead_id : `https://app.close.com/lead/${lead.close_lead_id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>{lead.callback_date ? `${new Date(lead.callback_date).toLocaleDateString()}${lead.callback_time ? ` ${lead.callback_time}` : ''}` : "N/A"}</TableCell>
                    <TableCell><Pill variant={lead.status === "new" ? "info" : "default"}>{lead.status || "new"}</Pill></TableCell>
                    <TableCell className="max-w-[200px] truncate">{lead.notes || "N/A"}</TableCell>
                    <TableCell className="text-right"><div className="flex gap-2 justify-end"><Button variant="ghost" size="icon" onClick={() => openEdit(lead)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: lead.id, kind: "manual" })}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                  </TableRow>
                ))}
                {leads.length === 0 && (
                  <TableRow><TableCell colSpan={9}><EmptyState icon={Users} title="No manual warm leads yet" description="Add your first warm lead or send enriched leads from the Enrichment tab." /></TableCell></TableRow>
                )}
              </TableBody></Table>
          </Panel>
        </div>
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </DashboardLayout>
  );
};

const SetterWarmLeads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [enrichedLeads, setEnrichedLeads] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => { loadLeads(); loadEnrichedLeads(); }, []);

  const loadLeads = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("leads").select("*").eq("setter_id", user.id).order("created_at", { ascending: false });
    if (data) setLeads(data);
  };

  const loadEnrichedLeads = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("warm_leads").select("*").eq("created_by_user_id", user.id).order("created_at", { ascending: false });
    if (data) setEnrichedLeads(data);
  };

  const saveLead: SetterWarmLeadsViewProps["onSaveLead"] = async (payload, editingId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = editingId
      ? await supabase.from("leads").update(payload).eq("id", editingId)
      : await supabase.from("leads").insert({ ...payload, setter_id: user.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    loadLeads();
    return true;
  };

  const deleteLead: SetterWarmLeadsViewProps["onDeleteLead"] = async (id, kind) => {
    const table = kind === "manual" ? "leads" : "warm_leads";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    if (kind === "manual") loadLeads(); else loadEnrichedLeads();
    return true;
  };

  const lookupClose: SetterWarmLeadsViewProps["onLookupClose"] = async (link) => {
    const { data, error } = await supabase.functions.invoke("booking-public", {
      body: { action: "close_lead", close_lead_link: link },
    });
    if (error || data?.error) return { error: data?.error || error?.message || "Lead not found" };
    return data as CloseLeadFill;
  };

  return <SetterWarmLeadsView leads={leads} enrichedLeads={enrichedLeads} onLookupClose={lookupClose} onSaveLead={saveLead} onDeleteLead={deleteLead} />;
};

export default SetterWarmLeads;
