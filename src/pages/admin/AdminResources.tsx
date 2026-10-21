import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, ExternalLink, Upload, FileIcon, FileText, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

const DELETE_ALLOWED_ROLES = ['admin', 'dev', 'ops', 'csm'];

const AdminResources = () => {
  const [resources, setResources] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    url: "",
    category: "video",
    visible_to_clients: false
  });

  useEffect(() => {
    loadResources();
    checkDeletePermission();
  }, []);

  const checkDeletePermission = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (roles?.some(r => DELETE_ALLOWED_ROLES.includes(r.role))) {
      setCanDelete(true);
    }
  };

  const handleDelete = async (resource: any) => {
    try {
      // Delete file from storage if it exists
      if (resource.file_path) {
        await supabase.storage.from('resource-files').remove([resource.file_path]);
      }
      
      // Delete from database
      const { error } = await supabase.from('resources').delete().eq('id', resource.id);
      
      if (error) throw error;
      
      toast.success('Resource deleted');
      loadResources();
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`);
    }
  };
  const loadResources = async () => {
    const {
      data
    } = await supabase.from("resources").select("*").order("created_at", {
      ascending: false
    });
    if (data) setResources(data);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      let filePath = null;
      let uploadedFileName = null;

      // Upload file if one is selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const uniqueFileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        filePath = `${formData.category}/${uniqueFileName}`;
        const {
          error: uploadError
        } = await supabase.storage.from('resource-files').upload(filePath, selectedFile);
        if (uploadError) {
          toast.error(`File upload failed: ${uploadError.message}`);
          setUploading(false);
          return;
        }
        uploadedFileName = selectedFile.name;
      }

      // Insert resource with file path and URL
      const resourceData: any = {
        ...formData,
        file_path: filePath,
        file_name: uploadedFileName
      };

      // If file was uploaded, set URL to the public URL
      if (filePath) {
        const {
          data: {
            publicUrl
          }
        } = supabase.storage.from('resource-files').getPublicUrl(filePath);
        resourceData.url = publicUrl;
      }
      const {
        error
      } = await supabase.from("resources").insert([resourceData]);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Resource added successfully");
        setOpen(false);
        loadResources();
        setFormData({
          title: "",
          description: "",
          url: "",
          category: "video",
          visible_to_clients: false
        });
        setSelectedFile(null);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };
  const filterByCategory = (category: string) => {
    return resources.filter(r => r.category === category);
  };
  return <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Resources"
          gradient
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Resource
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Resource</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input required value={formData.title} onChange={e => setFormData({
                  ...formData,
                  title: e.target.value
                })} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={formData.description} onChange={e => setFormData({
                  ...formData,
                  description: e.target.value
                })} />
                </div>
                <div className="space-y-2">
                  <Label>Upload File (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="cursor-pointer" />
                    {selectedFile && <div className="flex items-center gap-1 text-sm text-primary">
                        <FileIcon className="h-4 w-4" />
                        <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                      </div>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload a file directly or provide a URL below
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>URL {!selectedFile && "*"}</Label>
                  <Input required={!selectedFile} type="url" value={formData.url} onChange={e => setFormData({
                  ...formData,
                  url: e.target.value
                })} placeholder={selectedFile ? "Auto-generated from uploaded file" : "https://..."} disabled={!!selectedFile} />
                  {selectedFile && <p className="text-xs text-muted-foreground">
                      URL will be auto-generated from uploaded file
                    </p>}
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <select required value={formData.category} onChange={e => setFormData({
                  ...formData,
                  category: e.target.value
                })} className="w-full p-2 rounded-md border border-border bg-background">
                    <option value="video">Video Resources</option>
                    <option value="template">Templates</option>
                    <option value="testimonial">Testimonials</option>
                    <option value="process">Processes</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.visible_to_clients} onCheckedChange={checked => setFormData({
                  ...formData,
                  visible_to_clients: checked
                })} />
                  <Label>Visible to Clients</Label>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? <>
                        <Upload className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </> : "Add Resource"}
                  </Button>
                </div>
              </form>
              </DialogContent>
            </Dialog>
          }
        />
        <div className="space-y-5">
          <Tabs defaultValue="video" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="video">Video Resources</TabsTrigger>
            <TabsTrigger value="template">Templates</TabsTrigger>
            <TabsTrigger value="testimonial">Testimonials</TabsTrigger>
            <TabsTrigger value="process">Processes</TabsTrigger>
          </TabsList>

            {["video", "template", "testimonial", "process"].map(category => <TabsContent key={category} value={category} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filterByCategory(category).map(resource => <Card key={resource.id} className="border-border shadow-card">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="truncate pr-2">{resource.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/90">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Resource</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{resource.title}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(resource)} className="bg-destructive hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                      {resource.visible_to_clients && <p className="text-xs text-primary mt-2">Visible to clients</p>}
                    </CardContent>
                  </Card>)}
                {filterByCategory(category).length === 0 && (
                  <div className="col-span-2">
                    <EmptyState 
                      icon={FileText}
                      title="No resources"
                      description="No resources in this category yet."
                    />
                  </div>
                )}
              </div>
            </TabsContent>)}
          </Tabs>
        </div>
      </PageContainer>
    </DashboardLayout>;
};
export default AdminResources;