import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, FolderOpen, Eye } from "lucide-react";
import { format } from "date-fns";

export interface ClientDocument {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  document_category: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contract",
  invoice: "Invoice",
  proof_of_payment: "Proof of Payment",
  receipt: "Receipt",
  onboarding_form: "Onboarding form",
  other: "Other",
};

const CATEGORY_STYLES: Record<string, string> = {
  contract: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  invoice: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  proof_of_payment: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  receipt: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  onboarding_form: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const PDF_EXTENSION = "pdf";

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export interface ClientDocumentsViewProps {
  loading: boolean;
  documents: ClientDocument[];
  previewDoc: ClientDocument | null;
  previewUrl: string | null;
  previewLoading: boolean;
  onPreview: (doc: ClientDocument) => void;
  onDownload: (filePath: string, fileName: string) => void;
  onClosePreview: () => void;
}

export const ClientDocumentsView = ({
  loading,
  documents,
  previewDoc,
  previewUrl,
  previewLoading,
  onPreview,
  onDownload,
  onClosePreview,
}: ClientDocumentsViewProps) => {
  const renderPreviewContent = () => {
    if (previewLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-2">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          </div>
        </div>
      );
    }

    if (!previewUrl || !previewDoc) return null;

    const ext = getFileExtension(previewDoc.file_name);

    if (IMAGE_EXTENSIONS.includes(ext)) {
      return (
        <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
          <img
            src={previewUrl}
            alt={previewDoc.title}
            className="max-w-full max-h-[65vh] object-contain rounded-md"
          />
        </div>
      );
    }

    if (ext === PDF_EXTENSION) {
      return (
        <iframe
          src={previewUrl}
          title={previewDoc.title}
          className="w-full h-[70vh] rounded-md border border-border"
        />
      );
    }

    // Unsupported preview type
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground text-center">
          Preview is not available for this file type.<br />
          Please download the file to view it.
        </p>
      </div>
    );
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader
          title="Documents"
          subtitle="View and download your contracts, invoices, receipts, and other documents"
        />

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents available"
            description="Documents will appear here once they've been uploaded by our team."
          />
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <Card
                key={doc.id}
                className="border-border shadow-card cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => onPreview(doc)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{doc.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge className={CATEGORY_STYLES[doc.document_category] || CATEGORY_STYLES.other}>
                          {CATEGORY_LABELS[doc.document_category] || doc.document_category}
                        </Badge>
                        {doc.description && <span>{doc.description}</span>}
                        <span>• {format(new Date(doc.created_at), "dd MMM yyyy")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview(doc);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(doc.file_path, doc.file_name);
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!previewDoc} onOpenChange={(open) => !open && onClosePreview()}>
          <DialogContent className="max-w-4xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>{previewDoc?.title}</DialogTitle>
              <DialogDescription>
                {previewDoc && (
                  <span className="flex items-center gap-2">
                    <Badge className={CATEGORY_STYLES[previewDoc.document_category] || CATEGORY_STYLES.other}>
                      {CATEGORY_LABELS[previewDoc.document_category] || previewDoc.document_category}
                    </Badge>
                    <span>
                      {format(new Date(previewDoc.created_at), "dd MMM yyyy")}
                    </span>
                    {previewDoc.description && <span>— {previewDoc.description}</span>}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {renderPreviewContent()}
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  previewDoc && onDownload(previewDoc.file_path, previewDoc.file_name)
                }
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

const ClientDocuments = () => {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  // Cleanup preview URL on unmount or when dialog closes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: linkedProfiles } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);

      const { data: directProfile } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const allProfileIds = new Set<string>();
      linkedProfiles?.forEach(p => allProfileIds.add(p.client_profile_id));
      if (directProfile) allProfileIds.add(directProfile.id);

      const profileIdsArray = Array.from(allProfileIds);
      if (profileIdsArray.length === 0) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("client_receipts")
        .select("id, title, description, file_path, file_name, document_category, created_at")
        .in("client_profile_id", profileIdsArray)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments((data || []) as unknown as ClientDocument[]);
    } catch (error) {
      console.error("Failed to load documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("receipts")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download document");
    }
  };

  const handlePreview = async (doc: ClientDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewUrl(null);

    try {
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
    } catch (error) {
      console.error("Preview failed:", error);
      toast.error("Failed to load preview");
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  return (
    <ClientDocumentsView
      loading={loading}
      documents={documents}
      previewDoc={previewDoc}
      previewUrl={previewUrl}
      previewLoading={previewLoading}
      onPreview={handlePreview}
      onDownload={handleDownload}
      onClosePreview={closePreview}
    />
  );
};

export default ClientDocuments;
