import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { DOC_TYPE_LABELS, DOC_TYPE_STYLES } from "@/lib/referrals";
import { toast } from "sonner";
import { Download, FileText, FolderOpen, Eye } from "lucide-react";
import { format } from "date-fns";

interface PartnerDocument {
  id: string;
  file_url: string;
  file_name: string;
  doc_type: string;
  uploaded_at: string;
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const PDF_EXTENSION = "pdf";

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

/** Read-only partner document folder — the CEO uploads into it from the
 *  CEO Referrals tab; partners can only view/download. */
const PartnerDocuments = () => {
  const { partner, isLoading: partnerLoading } = usePartnerProfile();
  const [previewDoc, setPreviewDoc] = useState<PartnerDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["partner-documents", partner?.id],
    enabled: !!partner?.id,
    queryFn: async (): Promise<PartnerDocument[]> => {
      const { data, error } = await supabase
        .from("partner_documents")
        .select("id, file_url, file_name, doc_type, uploaded_at")
        .eq("partner_id", partner!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const loading = partnerLoading || docsLoading;

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("partner-documents")
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

  const handlePreview = async (doc: PartnerDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const { data, error } = await supabase.storage
        .from("partner-documents")
        .createSignedUrl(doc.file_url, 3600);
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
            alt={previewDoc.file_name}
            className="max-w-full max-h-[65vh] object-contain rounded-md"
          />
        </div>
      );
    }

    if (ext === PDF_EXTENSION) {
      return (
        <iframe
          src={previewUrl}
          title={previewDoc.file_name}
          className="w-full h-[70vh] rounded-md border border-border"
        />
      );
    }

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
    <DashboardLayout role="partner">
      <PageContainer>
        <PageHeader
          title="Documents"
          subtitle="View and download your partnership contracts and proof of payments"
        />

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !documents || documents.length === 0 ? (
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
                onClick={() => handlePreview(doc)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{doc.file_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge className={DOC_TYPE_STYLES[doc.doc_type] || DOC_TYPE_STYLES.other}>
                          {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                        </Badge>
                        <span>• {format(new Date(doc.uploaded_at), "dd MMM yyyy")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(doc);
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
                        handleDownload(doc.file_url, doc.file_name);
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

        <Dialog open={!!previewDoc} onOpenChange={(open) => !open && closePreview()}>
          <DialogContent className="max-w-4xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>{previewDoc?.file_name}</DialogTitle>
              <DialogDescription>
                {previewDoc && (
                  <span className="flex items-center gap-2">
                    <Badge className={DOC_TYPE_STYLES[previewDoc.doc_type] || DOC_TYPE_STYLES.other}>
                      {DOC_TYPE_LABELS[previewDoc.doc_type] || previewDoc.doc_type}
                    </Badge>
                    <span>{format(new Date(previewDoc.uploaded_at), "dd MMM yyyy")}</span>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {renderPreviewContent()}
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewDoc && handleDownload(previewDoc.file_url, previewDoc.file_name)}
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

export default PartnerDocuments;
