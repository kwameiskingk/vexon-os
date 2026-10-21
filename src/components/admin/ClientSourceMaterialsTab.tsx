import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Trash2, ExternalLink, Plus, Loader2, Calendar as CalendarIcon, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";

interface SourceMaterial {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  created_at: string;
}

interface ClientSourceMaterialsTabProps {
  clientId: string;
  calendlyLink?: string | null;
  onCalendlyUpdate?: (link: string) => void;
}

const CATEGORIES = [
  { value: "call_sheet", label: "Call Sheet" },
  { value: "script", label: "Script" },
  { value: "training", label: "Training Material" },
  { value: "general", label: "General Document" },
];

export function ClientSourceMaterialsTab({ clientId, calendlyLink, onCalendlyUpdate }: ClientSourceMaterialsTabProps) {
  const [materials, setMaterials] = useState<SourceMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingCalendly, setEditingCalendly] = useState(false);
  const [localCalendly, setLocalCalendly] = useState(calendlyLink || "");

  // Upload form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    loadMaterials();
  }, [clientId]);

  useEffect(() => {
    setLocalCalendly(calendlyLink || "");
  }, [calendlyLink]);

  const loadMaterials = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_source_materials")
      .select("*")
      .eq("client_profile_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading source materials:", error);
    } else {
      setMaterials((data || []) as SourceMaterial[]);
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
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${clientId}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from("source-materials")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase
        .from("client_source_materials")
        .insert({
          client_profile_id: clientId,
          title: title.trim(),
          description: description.trim() || null,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type || file.name.split(".").pop() || null,
          file_size: file.size,
          category,
          uploaded_by: user?.id || null,
        });

      if (insertError) throw insertError;

      toast.success("Source material uploaded");
      setTitle("");
      setDescription("");
      setCategory("general");
      setFile(null);
      setUploadOpen(false);
      loadMaterials();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (material: SourceMaterial) => {
    if (!confirm(`Delete "${material.title}"?`)) return;

    const { error: storageError } = await supabase.storage
      .from("source-materials")
      .remove([material.file_path]);

    if (storageError) console.warn("Storage delete warning:", storageError);

    const { error } = await supabase
      .from("client_source_materials")
      .delete()
      .eq("id", material.id);

    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Deleted");
      loadMaterials();
    }
  };

  const handleViewFile = async (material: SourceMaterial) => {
    const { data } = await supabase.storage
      .from("source-materials")
      .createSignedUrl(material.file_path, 3600);

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Failed to generate download link");
    }
  };

  const saveCalendly = async () => {
    const { error } = await supabase
      .from("client_profiles")
      .update({ calendly_link: localCalendly.trim() || null })
      .eq("id", clientId);

    if (error) {
      toast.error("Failed to save Calendly link");
    } else {
      toast.success("Calendly link saved");
      setEditingCalendly(false);
      onCalendlyUpdate?.(localCalendly.trim());
    }
  };

  const getCategoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Calendly Link */}
      <Card className="border-border shadow-card">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Calendly Booking Link</h3>
            </div>
            <Button
              variant={editingCalendly ? "default" : "outline"}
              size="sm"
              onClick={editingCalendly ? saveCalendly : () => setEditingCalendly(true)}
            >
              {editingCalendly ? "Save" : "Edit"}
            </Button>
          </div>
          {editingCalendly ? (
            <div className="flex gap-2">
              <Input
                placeholder="https://calendly.com/..."
                value={localCalendly}
                onChange={(e) => setLocalCalendly(e.target.value)}
              />
              <Button variant="ghost" size="sm" onClick={() => { setEditingCalendly(false); setLocalCalendly(calendlyLink || ""); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {calendlyLink ? (
                <a href={calendlyLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {calendlyLink}
                </a>
              ) : (
                "No Calendly link set"
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Source Materials */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Source Materials</h2>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Upload Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Source Material</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Title *</Label>
                <Input placeholder="e.g. Call Sheet v2" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea placeholder="Brief description..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>File *</Label>
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button onClick={handleUpload} disabled={uploading || !file || !title.trim()} className="w-full">
                {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Upload</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : materials.length === 0 ? (
        <Card className="border-border shadow-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No source materials uploaded yet.</p>
            <p className="text-xs mt-1">Upload call sheets, scripts, and other documents for setters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {materials.map(m => (
            <Card key={m.id} className="border-border shadow-card">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{getCategoryLabel(m.category)}</Badge>
                        <span>{m.file_name}</span>
                        {m.file_size && <span>• {formatFileSize(m.file_size)}</span>}
                        <span>• {format(new Date(m.created_at), "MMM d, yyyy")}</span>
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewFile(m)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
