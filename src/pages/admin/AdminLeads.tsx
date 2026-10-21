import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";

const AdminLeads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<any>(null);
  const [formData, setFormData] = useState({
    company_name: "",
    contact_name: "",
    prospect_job_title: "",
    email: "",
    mobile: "",
    linkedin_url: "",
    company_website: "",
    callback_date: "",
    callback_time: "",
    source: "",
    industry: "",
    notes: "",
  });

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error loading leads:", error);
      toast.error("Failed to load leads");
      return;
    }
    
    if (data) setLeads(data);
  };

  const handleLeadClick = (lead: any) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, lead: any) => {
    e.stopPropagation();
    setLeadToDelete(lead);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!leadToDelete) return;

    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", leadToDelete.id);

    if (error) {
      toast.error("Failed to delete warm lead");
    } else {
      toast.success("Warm lead deleted successfully");
      loadLeads();
    }

    setDeleteDialogOpen(false);
    setLeadToDelete(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("You must be logged in");
      return;
    }

    const { error } = await supabase.from("leads").insert([{ ...formData, setter_id: user.id }]);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Warm lead added successfully");
      setOpen(false);
      loadLeads();
      setFormData({
        company_name: "",
        contact_name: "",
        prospect_job_title: "",
        email: "",
        mobile: "",
        linkedin_url: "",
        company_website: "",
        callback_date: "",
        callback_time: "",
        source: "",
        industry: "",
        notes: "",
      });
    }
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Warm Leads"
          gradient
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="icon" title="Add Warm Lead">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Warm Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input
                      required
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Name *</Label>
                    <Input
                      required
                      value={formData.contact_name}
                      onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prospect Job Title</Label>
                    <Input
                      value={formData.prospect_job_title}
                      onChange={(e) => setFormData({ ...formData, prospect_job_title: e.target.value })}
                      placeholder="e.g. Head of Talent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input
                      value={formData.mobile}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Website</Label>
                    <Input
                      value={formData.company_website}
                      onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>LinkedIn URL</Label>
                    <Input
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Callback Date</Label>
                    <Input
                      type="date"
                      value={formData.callback_date}
                      className="[color-scheme:dark]"
                      onChange={(e) => setFormData({ ...formData, callback_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Callback Time</Label>
                    <Input
                      type="time"
                      value={formData.callback_time}
                      className="[color-scheme:dark]"
                      onChange={(e) => setFormData({ ...formData, callback_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Input
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="Cold Call, Email, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Add Lead</Button>
                </div>
              </form>
              </DialogContent>
            </Dialog>
          }
        />
        <div className="space-y-5">
          <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle>All Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2">Company</th>
                    <th className="text-left p-2">Contact</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Mobile</th>
                    <th className="text-left p-2">Follow-up</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr 
                      key={lead.id} 
                      className="border-b border-border cursor-pointer hover:bg-muted/20 transition-all duration-150"
                      onClick={() => handleLeadClick(lead)}
                    >
                      <td className="p-2">{lead.company_name}</td>
                      <td className="p-2">{lead.contact_name}</td>
                      <td className="p-2">{lead.email || "N/A"}</td>
                      <td className="p-2">{lead.mobile || "N/A"}</td>
                      <td className="p-2">{lead.callback_date || "N/A"}</td>
                      <td className="p-2">
                        <span className="px-2 py-1 rounded-full bg-secondary text-xs">
                          {lead.status || "new"}
                        </span>
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteClick(e, lead)}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState 
                            icon={Users}
                            title="No leads yet"
                            description="Add your first warm lead to get started."
                          />
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </CardContent>
          </Card>

          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Lead Details</DialogTitle>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Company Name</Label>
                    <p className="font-medium">{selectedLead.company_name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Contact Name</Label>
                    <p className="font-medium">{selectedLead.contact_name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedLead.email || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Mobile</Label>
                    <p className="font-medium">{selectedLead.mobile || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Company Website</Label>
                    <p className="font-medium">{selectedLead.company_website || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">LinkedIn URL</Label>
                    <p className="font-medium break-all">{selectedLead.linkedin_url || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Callback Date</Label>
                    <p className="font-medium">{selectedLead.callback_date || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Callback Time</Label>
                    <p className="font-medium">{selectedLead.callback_time || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Source</Label>
                    <p className="font-medium">{selectedLead.source || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Industry</Label>
                    <p className="font-medium">{selectedLead.industry || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Status</Label>
                    <span className="inline-block px-3 py-1 rounded-full bg-secondary text-sm">
                      {selectedLead.status || "new"}
                    </span>
                  </div>
                </div>
                {selectedLead.notes && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="font-medium whitespace-pre-wrap">{selectedLead.notes}</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the lead for{" "}
                <strong>{leadToDelete?.company_name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminLeads;
