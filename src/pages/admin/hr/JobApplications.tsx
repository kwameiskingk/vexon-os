import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit2, Trash2, Eye, ExternalLink, FileStack, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ApplicationForm {
  id: string;
  role_name: string;
  jotform_embed_url: string;
  is_active: boolean;
  created_at: string;
}

interface ApplicationSubmission {
  id: string;
  form_id: string | null;
  candidate_name: string;
  role_applied: string;
  email: string | null;
  phone: string | null;
  submission_date: string;
  score: number | null;
  status: string;
  notes: string | null;
  jotform_submission_id: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  pass: "bg-green-500/10 text-green-500 border-green-500/20",
  fail: "bg-red-500/10 text-red-500 border-red-500/20",
  interview: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  hired: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const roleOptions = ["Setter", "SDR Manager", "Account Executive", "CSM", "Operations", "Other"];

export default function JobApplications() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("forms");
  const [selectedFormForPreview, setSelectedFormForPreview] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isAddSubmissionOpen, setIsAddSubmissionOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<ApplicationForm | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ApplicationSubmission | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [formData, setFormData] = useState({
    role_name: "",
    jotform_embed_url: "",
    is_active: true,
  });

  // Submission state
  const [submissionData, setSubmissionData] = useState({
    candidate_name: "",
    role_applied: "",
    email: "",
    phone: "",
    submission_date: format(new Date(), "yyyy-MM-dd"),
    score: "",
    status: "pending",
    notes: "",
  });

  // Fetch forms
  const { data: forms = [], isLoading: formsLoading } = useQuery({
    queryKey: ["job-application-forms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_application_forms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ApplicationForm[];
    },
  });

  // Fetch submissions
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: ["job-application-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_application_submissions")
        .select("*")
        .order("submission_date", { ascending: false });
      if (error) throw error;
      return data as ApplicationSubmission[];
    },
  });

  // Add/Edit form mutation
  const formMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("job_application_forms")
          .update({
            role_name: data.role_name,
            jotform_embed_url: data.jotform_embed_url,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_application_forms").insert({
          role_name: data.role_name,
          jotform_embed_url: data.jotform_embed_url,
          is_active: data.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-application-forms"] });
      toast.success(editingForm ? "Form updated" : "Form added");
      setIsAddFormOpen(false);
      setEditingForm(null);
      resetFormData();
    },
    onError: (error) => {
      toast.error("Failed to save form: " + error.message);
    },
  });

  // Delete form mutation
  const deleteFormMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_application_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-application-forms"] });
      toast.success("Form deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete form: " + error.message);
    },
  });

  // Add submission mutation
  const addSubmissionMutation = useMutation({
    mutationFn: async (data: typeof submissionData) => {
      const { error } = await supabase.from("job_application_submissions").insert({
        candidate_name: data.candidate_name,
        role_applied: data.role_applied,
        email: data.email || null,
        phone: data.phone || null,
        submission_date: data.submission_date,
        score: data.score ? parseFloat(data.score) : null,
        status: data.status,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-application-submissions"] });
      toast.success("Submission added");
      setIsAddSubmissionOpen(false);
      resetSubmissionData();
    },
    onError: (error) => {
      toast.error("Failed to add submission: " + error.message);
    },
  });

  // Update submission mutation
  const updateSubmissionMutation = useMutation({
    mutationFn: async (data: Partial<ApplicationSubmission> & { id: string }) => {
      const { error } = await supabase
        .from("job_application_submissions")
        .update({
          score: data.score,
          status: data.status,
          notes: data.notes,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-application-submissions"] });
      toast.success("Submission updated");
      setSelectedSubmission(null);
    },
    onError: (error) => {
      toast.error("Failed to update submission: " + error.message);
    },
  });

  const resetFormData = () => {
    setFormData({ role_name: "", jotform_embed_url: "", is_active: true });
  };

  const resetSubmissionData = () => {
    setSubmissionData({
      candidate_name: "",
      role_applied: "",
      email: "",
      phone: "",
      submission_date: format(new Date(), "yyyy-MM-dd"),
      score: "",
      status: "pending",
      notes: "",
    });
  };

  const handleEditForm = (form: ApplicationForm) => {
    setEditingForm(form);
    setFormData({
      role_name: form.role_name,
      jotform_embed_url: form.jotform_embed_url,
      is_active: form.is_active,
    });
    setIsAddFormOpen(true);
  };

  const filteredSubmissions = submissions.filter((sub) => {
    if (filterRole !== "all" && sub.role_applied !== filterRole) return false;
    if (filterStatus !== "all" && sub.status !== filterStatus) return false;
    return true;
  });

  const selectedPreviewForm = forms.find((f) => f.id === selectedFormForPreview);

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Job Applications"
          subtitle="Manage application forms and track candidate submissions"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="forms" className="flex items-center gap-2">
              <FileStack className="h-4 w-4" />
              Forms
            </TabsTrigger>
            <TabsTrigger value="submissions" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Submissions
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          {/* Forms Tab */}
          <TabsContent value="forms" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Application Forms</h3>
              <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetFormData(); setEditingForm(null); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Form
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingForm ? "Edit Form" : "Add New Form"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Role Name</Label>
                      <Select
                        value={formData.role_name}
                        onValueChange={(val) => setFormData({ ...formData, role_name: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>JotForm Embed URL</Label>
                      <Input
                        value={formData.jotform_embed_url}
                        onChange={(e) => setFormData({ ...formData, jotform_embed_url: e.target.value })}
                        placeholder="https://form.jotform.com/..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Paste the full JotForm embed URL or form URL
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={() => formMutation.mutate({ ...formData, id: editingForm?.id })}
                      disabled={!formData.role_name || !formData.jotform_embed_url}
                    >
                      {editingForm ? "Update" : "Add"} Form
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Embed URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : forms.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No forms configured yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      forms.map((form) => (
                        <TableRow key={form.id}>
                          <TableCell className="font-medium">{form.role_name}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {form.jotform_embed_url}
                          </TableCell>
                          <TableCell>
                            <Badge variant={form.is_active ? "default" : "secondary"}>
                              {form.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(form.created_at), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedFormForPreview(form.id);
                                  setActiveTab("preview");
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEditForm(form)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteFormMutation.mutate(form.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Submissions Tab */}
          <TabsContent value="submissions" className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isAddSubmissionOpen} onOpenChange={setIsAddSubmissionOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetSubmissionData}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Submission
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Manual Submission</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Candidate Name *</Label>
                        <Input
                          value={submissionData.candidate_name}
                          onChange={(e) =>
                            setSubmissionData({ ...submissionData, candidate_name: e.target.value })
                          }
                          placeholder="Full name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role Applied *</Label>
                        <Select
                          value={submissionData.role_applied}
                          onValueChange={(val) =>
                            setSubmissionData({ ...submissionData, role_applied: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={submissionData.email}
                          onChange={(e) => setSubmissionData({ ...submissionData, email: e.target.value })}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={submissionData.phone}
                          onChange={(e) => setSubmissionData({ ...submissionData, phone: e.target.value })}
                          placeholder="+44 7700 900000"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Submission Date</Label>
                        <Input
                          type="date"
                          value={submissionData.submission_date}
                          onChange={(e) =>
                            setSubmissionData({ ...submissionData, submission_date: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Score</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={submissionData.score}
                          onChange={(e) => setSubmissionData({ ...submissionData, score: e.target.value })}
                          placeholder="0-100"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={submissionData.status}
                          onValueChange={(val) => setSubmissionData({ ...submissionData, status: val })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="pass">Pass</SelectItem>
                            <SelectItem value="fail">Fail</SelectItem>
                            <SelectItem value="interview">Interview</SelectItem>
                            <SelectItem value="hired">Hired</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={submissionData.notes}
                        onChange={(e) => setSubmissionData({ ...submissionData, notes: e.target.value })}
                        placeholder="Additional notes about this candidate..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={() => addSubmissionMutation.mutate(submissionData)}
                      disabled={!submissionData.candidate_name || !submissionData.role_applied}
                    >
                      Add Submission
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Submission Date</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredSubmissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No submissions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSubmissions.map((sub) => (
                        <TableRow key={sub.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <div>
                              <div className="font-medium">{sub.candidate_name}</div>
                              {sub.email && (
                                <div className="text-sm text-muted-foreground">{sub.email}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{sub.role_applied}</TableCell>
                          <TableCell>{format(new Date(sub.submission_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell>
                            {sub.score !== null ? (
                              <span className="font-medium">{sub.score}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[sub.status] || ""} variant="outline">
                              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedSubmission(sub)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-4">
            <div className="flex items-center gap-4">
              <Label>Select Form to Preview:</Label>
              <Select
                value={selectedFormForPreview || ""}
                onValueChange={setSelectedFormForPreview}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a form" />
                </SelectTrigger>
                <SelectContent>
                  {forms
                    .filter((f) => f.is_active)
                    .map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.role_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedPreviewForm && (
                <Button variant="outline" size="sm" asChild>
                  <a href={selectedPreviewForm.jotform_embed_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </a>
                </Button>
              )}
            </div>

            {selectedPreviewForm ? (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <iframe
                    src={selectedPreviewForm.jotform_embed_url}
                    className="w-full min-h-[800px] border-0"
                    title={`${selectedPreviewForm.role_name} Application Form`}
                    allowFullScreen
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <FileStack className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Select a form above to preview</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Submission Detail Sheet */}
        <Sheet open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Candidate Details</SheetTitle>
            </SheetHeader>
            {selectedSubmission && (
              <div className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Candidate Name</Label>
                    <p className="font-medium text-lg">{selectedSubmission.candidate_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Role Applied</Label>
                      <p className="font-medium">{selectedSubmission.role_applied}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Submission Date</Label>
                      <p className="font-medium">
                        {format(new Date(selectedSubmission.submission_date), "MMM dd, yyyy")}
                      </p>
                    </div>
                  </div>
                  {selectedSubmission.email && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Email</Label>
                      <p className="font-medium">{selectedSubmission.email}</p>
                    </div>
                  )}
                  {selectedSubmission.phone && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Phone</Label>
                      <p className="font-medium">{selectedSubmission.phone}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium">Evaluation</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Score</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={selectedSubmission.score ?? ""}
                        onChange={(e) =>
                          setSelectedSubmission({
                            ...selectedSubmission,
                            score: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        placeholder="0-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={selectedSubmission.status}
                        onValueChange={(val) =>
                          setSelectedSubmission({ ...selectedSubmission, status: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                          <SelectItem value="interview">Interview</SelectItem>
                          <SelectItem value="hired">Hired</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={selectedSubmission.notes ?? ""}
                      onChange={(e) =>
                        setSelectedSubmission({ ...selectedSubmission, notes: e.target.value })
                      }
                      placeholder="Add notes about this candidate..."
                      rows={4}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() =>
                      updateSubmissionMutation.mutate({
                        id: selectedSubmission.id,
                        score: selectedSubmission.score,
                        status: selectedSubmission.status,
                        notes: selectedSubmission.notes,
                      })
                    }
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </PageContainer>
    </DashboardLayout>
  );
}
