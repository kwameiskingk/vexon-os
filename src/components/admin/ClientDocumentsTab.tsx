import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { OnboardingFormCard } from "@/components/client-onboarding/OnboardingFormCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, Download, Trash2, Upload, Loader2, FolderOpen } from "lucide-react";

interface ClientDocument {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  document_category: string;
  created_at: string;
}

const DOCUMENT_CATEGORIES = [
  { value: "contract", label: "Contract" },
  { value: "invoice", label: "Invoice" },
  { value: "proof_of_payment", label: "Proof of Payment" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
];

// Filed by the system, never chosen in the upload dialog: the client's
// onboarding-form answers as a PDF (client-onboarding, 6 Oct).
const SYSTEM_CATEGORY_LABELS: Record<string, string> = { onboarding_form: "Onboarding form" };

const getCategoryBadge = (cat: string) => {
  const styles: Record<string, string> = {
    onboarding_form: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    contract: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    invoice: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    proof_of_payment: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    receipt: "bg-purple-500/15 text-purple-500 border-purple-500/30",
    other: "bg-muted text-muted-foreground border-border",
  };
  const label = DOCUMENT_CATEGORIES.find(c => c.value === cat)?.label || SYSTEM_CATEGORY_LABELS[cat] || cat;
  return <Badge className={styles[cat] || styles.other}>{label}</Badge>;
};

interface ClientDocumentsTabProps {
  clientId: string;
}

export function ClientDocumentsTab({ clientId }: ClientDocumentsTabProps) {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("receipt");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [clientId]);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_receipts")
      .select("id, title, description, file_path, file_name, document_category, created_at")
      .eq("client_profile_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading documents:", error);
    } else {
      setDocuments((data || []) as unknown as ClientDocument[]);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      toast.error("Please provide a title and select a file");
      return;
    }

    setUploading(true);
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${clientId}/${Date.now()}_${sanitized}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase
        .from("client_receipts")
        .insert({
          client_profile_id: clientId,
          title: title.trim(),
          description: description.trim() || null,
          file_path: filePath,
          file_name: file.name,
          document_category: category,
          uploaded_by: user?.id || null,
        });

      if (insertError) throw insertError;

      toast.success("Document uploaded");
      resetForm();
      setUploadOpen(false);
      loadDocuments();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ClientDocument) => {
    const { data, error } = await supabase.storage
      .from("receipts")
      .download(doc.file_path);

    if (error) {
      toast.error("Failed to download");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (doc: ClientDocument) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;

    await supabase.storage.from("receipts").remove([doc.file_path]);

    const { error } = await supabase
      .from("client_receipts")
      .delete()
      .eq("id", doc.id);

    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Document deleted");
      loadDocuments();
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("receipt");
    setFile(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Client Documents</h2>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Upload Document
        </Button>
      </div>

      <OnboardingFormCard clientId={clientId} />

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents uploaded"
          description="Upload contracts, invoices, receipts, and proof of payments for this client."
        />
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <Card key={doc.id} className="border-border shadow-card">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getCategoryBadge(doc.document_category)}
                        <span>{doc.file_name}</span>
                        <span>• {format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                      </div>
                      {doc.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title *</Label>
              <Input placeholder="e.g. March 2026 Receipt" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input placeholder="Brief description..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>File *</Label>
              <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !file || !title.trim()}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : <><Upload className="h-4 w-4 mr-2" />Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
