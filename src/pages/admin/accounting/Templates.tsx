import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, FileText, Download, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";

const TEMPLATE_TYPES = [
  { value: 'invoice', label: 'Invoice Template' },
  { value: 'payment_terms', label: 'Payment Terms' },
  { value: 'reminder', label: 'Payment Reminder' },
  { value: 'bank_details', label: 'Bank Details' },
  { value: 'other', label: 'Other' }
];

export default function AccountingTemplates() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: ''
  });

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['accounting-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Create template mutation
  const createTemplate = useMutation({
    mutationFn: async (data: any) => {
      let filePath = null;
      
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_${data.name.replace(/\s+/g, '_')}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('accounting-templates')
          .upload(fileName, selectedFile);
        
        if (uploadError) throw uploadError;
        filePath = uploadData.path;
      }

      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('accounting_templates').insert({
        name: data.name,
        type: data.type,
        description: data.description || null,
        file_path: filePath,
        created_by: user.user?.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast.success('Template added successfully');
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add template');
    }
  });

  // Delete template mutation
  const deleteTemplate = useMutation({
    mutationFn: async (template: any) => {
      // Delete file from storage first
      if (template.file_path) {
        await supabase.storage
          .from('accounting-templates')
          .remove([template.file_path]);
      }
      
      const { error } = await supabase
        .from('accounting_templates')
        .delete()
        .eq('id', template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast.success('Template deleted');
    }
  });

  // Download template
  const handleDownload = async (template: any) => {
    if (!template.file_path) {
      toast.error('No file attached');
      return;
    }

    const { data, error } = await supabase.storage
      .from('accounting-templates')
      .download(template.file_path);

    if (error) {
      toast.error('Failed to download file');
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: '',
      description: ''
    });
    setSelectedFile(null);
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      invoice: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      payment_terms: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
      reminder: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      bank_details: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
      other: 'bg-gray-500/15 text-gray-500 border-gray-500/30'
    };
    const labels: Record<string, string> = {
      invoice: 'Invoice',
      payment_terms: 'Payment Terms',
      reminder: 'Reminder',
      bank_details: 'Bank Details',
      other: 'Other'
    };
    return <Badge className={styles[type] || styles.other}>{labels[type] || type}</Badge>;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Templates & Docs"
          subtitle="Invoice templates, payment terms, and standard documents"
          actions={
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Template
            </Button>
          }
        />
        
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No templates yet. Add your first template.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template: any) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(template.created_at), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>
                    {getTypeBadge(template.type)}
                  </div>
                  
                  {template.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    {template.file_path && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDownload(template)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-destructive ml-auto"
                      onClick={() => deleteTemplate.mutate(template)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Template Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Template</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Standard Invoice Template"
                />
              </div>

              <div>
                <Label>Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this template..."
                  rows={3}
                />
              </div>

              <div>
                <Label>File (PDF, DOC, etc.)</Label>
                <Input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createTemplate.mutate(formData)}
                disabled={!formData.name || !formData.type}
              >
                <Upload className="w-4 h-4 mr-2" />
                Add Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
}
