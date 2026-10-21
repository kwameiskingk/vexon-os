import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { format } from "date-fns";

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'id', label: 'ID Document' },
  { value: 'right_to_work', label: 'Right to Work' },
  { value: 'bank_details', label: 'Bank Details' },
  { value: 'other', label: 'Other' }
];

const TYPE_LABELS: Record<string, string> = {
  contract: 'Contract',
  id: 'ID',
  right_to_work: 'Right to Work',
  bank_details: 'Bank Details',
  other: 'Other'
};

/** The columns this page reads off an employee_documents row. */
interface DocumentRow {
  id: string;
  document_name: string;
  document_type: string;
  file_path: string | null;
  expiry_date: string | null;
  created_at: string;
  setters_profiles: { full_name: string | null } | null;
}

export default function HRDocuments() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    document_type: '',
    document_name: '',
    expiry_date: ''
  });

  // Fetch employees for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('id, full_name, email')
        .eq('active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['employee-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_documents')
        .select(`
          *,
          setters_profiles (
            full_name
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentRow[];
    }
  });

  // Upload document mutation
  const uploadDocument = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!selectedFile) throw new Error('No file selected');

      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${data.document_name.replace(/\s+/g, '_')}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase.from('employee_documents').insert({
        employee_id: data.employee_id,
        document_type: data.document_type,
        document_name: data.document_name,
        file_path: uploadData.path,
        expiry_date: data.expiry_date || null,
        uploaded_by: user.user?.id
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents'] });
      toast.success('Document uploaded successfully');
      setUploadModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document');
    }
  });

  // Delete document mutation
  const deleteDocument = useMutation({
    mutationFn: async (doc: DocumentRow) => {
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
      queryClient.invalidateQueries({ queryKey: ['employee-documents'] });
      toast.success('Document deleted');
    }
  });

  // Download document
  const handleDownload = async (doc: DocumentRow) => {
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

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.document_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      document_type: '',
      document_name: '',
      expiry_date: ''
    });
    setSelectedFile(null);
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) =>
    doc.document_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.setters_profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Document Storage"
          subtitle="Employee contracts, IDs, and important documents"
          actions={
            <ButtonV2 variant="primary" size="sm" onClick={() => setUploadModalOpen(true)}>
              Upload document
            </ButtonV2>
          }
        />

        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
            <Input
              placeholder="Search by document name or employee…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
            />
          </div>

          {/* Documents */}
          <Panel title="Documents" aside={<Pill>{filteredDocuments.length}</Pill>}>
            {isLoading ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">Loading documents…</p>
            ) : filteredDocuments.length === 0 ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No documents found.</p>
            ) : (
              <RowList
                columns="minmax(0,1.6fr) minmax(0,1fr) 130px 110px 110px auto"
                head={["Document", "Employee", "Type", "Expiry", "Uploaded", ""]}
              >
                {filteredDocuments.map((doc) => (
                  <Row key={doc.id}>
                    <RowName primary={doc.document_name} />
                    <div className="truncate text-[12.5px] text-[var(--ink2)]">{doc.setters_profiles?.full_name || '—'}</div>
                    <div><Pill>{TYPE_LABELS[doc.document_type] || doc.document_type}</Pill></div>
                    <RowNum className="text-[var(--ink2)]">
                      {doc.expiry_date ? format(new Date(doc.expiry_date), 'dd MMM yyyy') : '—'}
                    </RowNum>
                    <RowNum className="text-[var(--dim)]">{format(new Date(doc.created_at), 'dd MMM yyyy')}</RowNum>
                    <div className="flex justify-end gap-[6px]">
                      <ButtonV2 size="sm" variant="ghost" onClick={() => handleDownload(doc)}>
                        Download
                      </ButtonV2>
                      <ButtonV2
                        size="sm"
                        variant="ghost"
                        className="text-[var(--bad)] hover:bg-[var(--bad-bg)]"
                        onClick={() => deleteDocument.mutate(doc)}
                      >
                        Delete
                      </ButtonV2>
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
        </div>

        {/* Upload Modal */}
        <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Employee *</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
              <ButtonV2 onClick={() => setUploadModalOpen(false)}>
                Cancel
              </ButtonV2>
              <ButtonV2
                variant="primary"
                onClick={() => uploadDocument.mutate(formData)}
                disabled={!formData.employee_id || !formData.document_type || !formData.document_name || !selectedFile}
              >
                Upload
              </ButtonV2>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
}
