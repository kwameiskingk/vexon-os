import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Upload, Loader2 } from "lucide-react";

export interface LeadList {
  id: string;
  name: string;
  file_url: string | null;
  file_name: string | null;
  status: string;
  client_notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Needs Revision", variant: "destructive" },
};

export interface ClientLeadListsViewProps {
  loading: boolean;
  uploading: boolean;
  leadLists: LeadList[];
  newListName: string;
  setNewListName: (v: string) => void;
  newListNotes: string;
  setNewListNotes: (v: string) => void;
  setSelectedFile: (file: File | null) => void;
  handleUploadLeadList: () => void;
}

export const ClientLeadListsView = (props: ClientLeadListsViewProps) => {
  const {
    loading,
    uploading,
    leadLists,
    newListName,
    setNewListName,
    newListNotes,
    setNewListNotes,
    setSelectedFile,
    handleUploadLeadList,
  } = props;

  const statusBadge = (status: string) => {
    const config = STATUS_BADGES[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout role="client">
        <PageContainer>
          <PageHeader title="Lead Lists" subtitle="Loading..." gradient />
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader
          title="Lead Lists"
          subtitle="Optional — submit additional target lists beyond the one we've built for you"
          gradient
        />

        {/* Intro / context */}
        <Card className="border-border mb-5 bg-muted/30">
          <CardContent className="pt-5 pb-4 space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">We've got you covered.</span>{" "}
              As part of onboarding, our team builds your primary lead list for you — there's nothing you need to do here.
            </p>
            <p>
              This tab is for <span className="font-medium text-foreground">extra or excess lists</span> you'd like us to work on top of that.
              Simply <span className="font-medium text-foreground">upload a list</span> and we'll take it from there.
            </p>
            <p>
              Anything submitted here goes to your CSM, who will review it with you before our team starts working it. It's entirely optional.
            </p>
          </CardContent>
        </Card>

        {/* Lead Lists Section (upload) — moved to top */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Upload an Extra Lead List</CardTitle>
            <p className="text-sm text-muted-foreground">
              Have a list you'd like us to work? Drop it in here.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
              <p className="text-sm font-medium">Upload a New Lead List</p>
              <Input
                placeholder="List name (e.g. Q1 2026 Target Companies)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <div>
                <Label>File (CSV, Excel, or PDF)</Label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-1"
                />
              </div>
              <Textarea
                placeholder="Notes about this lead list (optional)..."
                value={newListNotes}
                onChange={(e) => setNewListNotes(e.target.value)}
              />
              <Button onClick={handleUploadLeadList} disabled={uploading || !newListName.trim()}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : "Submit Lead List"}
              </Button>
            </div>

            {leadLists.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No extra lead lists yet"
                description="Any extra lists you upload will appear here for tracking."
              />
            ) : (
              <div className="space-y-3">
                {leadLists.map((list) => (
                  <div key={list.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{list.name}</p>
                      {statusBadge(list.status)}
                    </div>
                    {list.file_name && (
                      <p className="text-xs text-muted-foreground">📎 {list.file_name}</p>
                    )}
                    {list.client_notes && (
                      <p className="text-sm text-muted-foreground">{list.client_notes}</p>
                    )}
                    {list.admin_notes && (
                      <div className="rounded bg-muted/50 p-2 text-sm">
                        <span className="font-medium text-muted-foreground">Admin: </span>
                        {list.admin_notes}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(list.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </DashboardLayout>
  );
};

const ClientLeadLists = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [uploading, setUploading] = useState(false);

  // Lead list upload state
  const [newListName, setNewListName] = useState("");
  const [newListNotes, setNewListNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all client profile IDs for this user
      const { data: linked } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);

      const { data: direct } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const ids = new Set<string>();
      linked?.forEach((p) => ids.add(p.client_profile_id));
      if (direct) ids.add(direct.id);

      const idsArray = Array.from(ids);
      setProfileIds(idsArray);

      if (idsArray.length === 0) {
        setLoading(false);
        return;
      }

      // Load lead lists
      const { data: lists } = await supabase
        .from("client_lead_lists")
        .select("*")
        .in("client_profile_id", idsArray)
        .order("created_at", { ascending: false });

      setLeadLists((lists || []) as LeadList[]);
    } catch (err) {
      console.error("Failed to load lead lists data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLeadList = async () => {
    if (!newListName.trim() || profileIds.length === 0) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let fileUrl = null;
      let fileName = null;

      if (selectedFile) {
        const filePath = `${profileIds[0]}/${Date.now()}-${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("lead-list-files")
          .upload(filePath, selectedFile);
        if (uploadError) throw uploadError;
        fileUrl = filePath;
        fileName = selectedFile.name;
      }

      const { error } = await supabase.from("client_lead_lists").insert({
        client_profile_id: profileIds[0],
        name: newListName.trim(),
        file_url: fileUrl,
        file_name: fileName,
        client_notes: newListNotes || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        created_by: user?.id,
      });

      if (error) throw error;
      toast({ title: "Lead List Submitted", description: "Your lead list has been submitted for review." });
      setNewListName("");
      setNewListNotes("");
      setSelectedFile(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <ClientLeadListsView
      loading={loading}
      uploading={uploading}
      leadLists={leadLists}
      newListName={newListName}
      setNewListName={setNewListName}
      newListNotes={newListNotes}
      setNewListNotes={setNewListNotes}
      setSelectedFile={setSelectedFile}
      handleUploadLeadList={handleUploadLeadList}
    />
  );
};

export default ClientLeadLists;
