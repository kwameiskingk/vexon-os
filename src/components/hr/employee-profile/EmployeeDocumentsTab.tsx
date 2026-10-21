// Employee Hub → Documents.
//
// 13 Oct (the owner): this tab used to key everything on setters_profiles.id, so
// anyone without a setter row (trialists, ops, finance, partners) saw
// "Document storage is not available for this role" and nothing a starter
// uploaded during SDR onboarding ever surfaced here. Now:
//   1. HR documents are keyed on the person's user id (employee_documents has
//      had a user_id column since January; legacy rows keep their setter id
//      and are matched on either).
//   2. "Profile photo" shows the current avatar with a download button, so
//      Elena can lift it straight into Google Workspace.
//   3. "Onboarding uploads" lists the starter's proof files straight from the
//      onboarding-assets bucket (proof/{user_id}/…) — the files outlive the
//      onboarding task rows, which get purged, so this is the durable record.
//      Labels come from the task rows when they still exist.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ONBOARDING_ASSETS_BUCKET, PROFILE_PHOTO_PREFIX, signedAssetUrl } from "@/hooks/useOnboardingFlow";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Plus, FileText, Download, Trash2, Upload, AlertTriangle, ExternalLink, Camera, ClipboardList } from "lucide-react";

interface EmployeeDocumentsTabProps {
  employee: any;
}

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'id', label: 'ID Document' },
  { value: 'right_to_work', label: 'Right to Work' },
  { value: 'bank_details', label: 'Bank Details' },
  { value: 'other', label: 'Other' }
];

const safeFile = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";

/** Trigger a browser download for a Blob. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface OnboardingUpload {
  path: string;
  name: string;
  label: string;
  createdAt: string | null;
  size: number | null;
  isPhoto: boolean;
}

export function EmployeeDocumentsTab({ employee }: EmployeeDocumentsTabProps) {
  const queryClient = useQueryClient();
  const userId: string | undefined = employee?.id;
  const setterId: string | undefined = employee?.setterId;
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    document_type: '',
    document_name: '',
    expiry_date: ''
  });

  // ── HR documents (contract, ID, right to work…) ─────────────────────────
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['employee-documents', userId, setterId],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase.from('employee_documents').select('*');
      q = setterId ? q.or(`user_id.eq.${userId},employee_id.eq.${setterId}`) : q.eq('user_id', userId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId
  });

  // ── Onboarding uploads (headset order, speed test, profile photo…) ──────
  const { data: onboardingUploads = [], isLoading: uploadsLoading, error: uploadsError } = useQuery({
    queryKey: ['employee-onboarding-uploads', userId],
    queryFn: async (): Promise<OnboardingUpload[]> => {
      if (!userId) return [];
      const prefix = `proof/${userId}`;
      const { data: objects, error } = await supabase.storage
        .from(ONBOARDING_ASSETS_BUCKET)
        .list(prefix, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const files = (objects ?? []).filter((o) => o.name && !o.name.endsWith('/'));
      if (files.length === 0) return [];

      // Labels from the task rows while they exist (proof files are named
      // {taskId}-{stamp}-{original}); the file itself is the durable record.
      const labels = new Map<string, string>();
      try {
        const { data: records } = await supabase
          .from('employee_onboarding')
          .select('id')
          .eq('user_id', userId);
        const ids = ((records ?? []) as { id: string }[]).map((r) => r.id);
        if (ids.length) {
          const { data: tasks } = await supabase
            .from('employee_onboarding_tasks')
            .select('id, task_label, task_key')
            .in('onboarding_id', ids);
          for (const t of (tasks ?? []) as { id: string; task_label: string | null; task_key: string }[]) {
            labels.set(t.id, t.task_label || t.task_key);
          }
        }
      } catch {
        // Labels are a nicety; the list still renders from the bucket.
      }

      return files.map((o) => {
        const isPhoto = o.name.startsWith(PROFILE_PHOTO_PREFIX);
        const taskId = o.name.slice(0, 36);
        const fromTask = labels.get(taskId);
        const label = isPhoto ? 'Profile photo' : fromTask ?? 'Onboarding upload';
        return {
          path: `${prefix}/${o.name}`,
          name: o.name.replace(/^[0-9a-f-]{36}-[a-z0-9]+-/, ''),
          label,
          createdAt: o.created_at ?? null,
          size: typeof o.metadata?.size === 'number' ? o.metadata.size : null,
          isPhoto,
        };
      });
    },
    enabled: !!userId
  });

  const downloadAsset = async (upload: OnboardingUpload) => {
    const { data, error } = await supabase.storage.from(ONBOARDING_ASSETS_BUCKET).download(upload.path);
    if (error || !data) {
      toast.error('Failed to download file');
      return;
    }
    const ext = upload.name.split('.').pop() || 'bin';
    const base = safeFile(`${employee.full_name || 'employee'}-${upload.label}`);
    saveBlob(data, `${base}.${ext}`);
  };

  const openAsset = async (upload: OnboardingUpload) => {
    try {
      window.open(await signedAssetUrl(upload.path), '_blank', 'noopener');
    } catch {
      toast.error('The file could not be opened just now.');
    }
  };

  // ── Profile photo (profiles.avatar_url, public bucket) ───────────────────
  const downloadAvatar = async () => {
    const url: string | null = employee?.avatar_url ?? null;
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
      saveBlob(blob, `${safeFile(`${employee.full_name || 'employee'}-profile-photo`)}.${ext}`);
    } catch {
      toast.error('Could not download the profile photo');
    }
  };

  // Upload document mutation
  const uploadDocument = useMutation({
    mutationFn: async (data: any) => {
      if (!selectedFile) throw new Error('No file selected');
      if (!userId) throw new Error('Employee ID not found');
      
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${data.document_name.replace(/\s+/g, '_')}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(fileName, selectedFile);
      
      if (uploadError) throw uploadError;

      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('employee_documents').insert({
        employee_id: setterId ?? null,
        user_id: userId,
        document_type: data.document_type,
        document_name: data.document_name,
        file_path: uploadData.path,
        expiry_date: data.expiry_date || null,
        uploaded_by: user.user?.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents', userId, setterId] });
      toast.success('Document uploaded successfully');
      setUploadModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload document');
    }
  });

  // Delete document mutation
  const deleteDocument = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.file_path) {
        await supabase.storage
          .from('employee-documents')
          .remove([doc.file_path]);
      }
      
      const { error } = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents', userId, setterId] });
      toast.success('Document deleted');
    }
  });

  // Download document
  const handleDownload = async (doc: any) => {
    if (!doc.file_path) {
      toast.error('No file attached');
      return;
    }

    const { data, error } = await supabase.storage
      .from('employee-documents')
      .download(doc.file_path);

    if (error) {
      toast.error('Failed to download file');
      return;
    }

    saveBlob(data, doc.document_name);
  };

  const resetForm = () => {
    setFormData({
      document_type: '',
      document_name: '',
      expiry_date: ''
    });
    setSelectedFile(null);
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      contract: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      id: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
      right_to_work: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      bank_details: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
      other: 'bg-gray-500/15 text-gray-500 border-gray-500/30'
    };
    const labels: Record<string, string> = {
      contract: 'Contract',
      id: 'ID',
      right_to_work: 'Right to Work',
      bank_details: 'Bank Details',
      other: 'Other'
    };
    return <Badge className={styles[type] || styles.other}>{labels[type] || type}</Badge>;
  };

  const getExpiryStatus = (expiryDate: string) => {
    if (!expiryDate) return null;
    
    const daysUntilExpiry = differenceInDays(new Date(expiryDate), new Date());
    
    if (daysUntilExpiry < 0) {
      return <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Expired</Badge>;
    }
    if (daysUntilExpiry <= 30) {
      return (
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-amber-500 text-sm">{daysUntilExpiry} days left</span>
        </div>
      );
    }
    return <span className="text-muted-foreground">{format(new Date(expiryDate), 'dd MMM yyyy')}</span>;
  };

  if (!userId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>This profile has no login, so there is nowhere to attach documents yet.</p>
        </CardContent>
      </Card>
    );
  }

  const fmtSize = (n: number | null) => (n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

  return (
    <div className="space-y-6">
      {/* Profile photo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" /> Profile photo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <UserAvatar name={employee.full_name || 'Unknown'} avatarUrl={employee.avatar_url} size="xl" />
          {employee.avatar_url ? (
            <>
              <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                The photo on this Vexon OS profile. Download it to set the same picture on their Google Workspace account.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={downloadAvatar}>
                  <Download className="w-4 h-4 mr-2" /> Download
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={employee.avatar_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" /> Open
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No profile photo yet. Starters upload one in the "Before you start" section of onboarding; existing staff can add one under Settings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Onboarding uploads */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" /> Onboarding uploads
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {uploadsLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading uploads…</div>
          ) : uploadsError ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Onboarding uploads could not be read for your role.
            </div>
          ) : onboardingUploads.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Nothing uploaded during onboarding (headset order, speed test, profile photo).
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onboardingUploads.map((u) => (
                  <TableRow key={u.path}>
                    <TableCell className="font-medium">{u.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.name}{u.size != null && <span className="ml-2 text-xs">{fmtSize(u.size)}</span>}
                    </TableCell>
                    <TableCell>{u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openAsset(u)} title="Open">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => downloadAsset(u)} title="Download">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* HR documents */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" /> HR documents
        </h3>
        <Button onClick={() => setUploadModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc: any) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.document_name}</TableCell>
                    <TableCell>{getTypeBadge(doc.document_type)}</TableCell>
                    <TableCell>{getExpiryStatus(doc.expiry_date) || '—'}</TableCell>
                    <TableCell>{format(new Date(doc.created_at), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-destructive"
                          onClick={() => deleteDocument.mutate(doc)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document for {employee.full_name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Document Type *</Label>
              <Select
                value={formData.document_type}
                onValueChange={(value) => setFormData({ ...formData, document_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Document Name *</Label>
              <Input
                value={formData.document_name}
                onChange={(e) => setFormData({ ...formData, document_name: e.target.value })}
                placeholder="e.g., Employment Contract"
              />
            </div>

            <div>
              <Label>Expiry Date (optional)</Label>
              <Input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="[color-scheme:dark]"
              />
            </div>

            <div>
              <Label>File *</Label>
              <Input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => uploadDocument.mutate(formData)}
              disabled={!formData.document_type || !formData.document_name || !selectedFile}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
