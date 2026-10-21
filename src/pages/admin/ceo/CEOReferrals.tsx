import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAuth } from "@/contexts/AuthContext";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO } from "@/hooks/useCapability";
import { useForceCEODepartment } from "@/hooks/useForceCEODepartment";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel, Pill } from "@/components/ui-v2";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, FileText, Handshake, Loader2, Upload } from "lucide-react";
import { REFERENCE_STATUS_LABELS, REFERENCE_STATUS_STYLES, type PartnerReference } from "@/pages/partner/PartnerReferences";
import {
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUS_STYLES,
  DOC_TYPE_LABELS,
  DOC_TYPE_STYLES,
} from "@/lib/referrals";

interface PartnerRow {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
}

export default function CEOReferrals() {
  const { user, isLoading } = useAuth();
  const { has: canViewCEO, isLoading: capLoading } = useCanViewCEO();
  useForceCEODepartment();
  const queryClient = useQueryClient();

  const [payoutDrafts, setPayoutDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [uploadPartnerId, setUploadPartnerId] = useState<string>("");
  const [uploadDocType, setUploadDocType] = useState<string>("contract");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ["ceo-partners"],
    queryFn: async (): Promise<PartnerRow[]> => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, full_name, email, company_name")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // 18 Sep: references (Marcus → partner) are the real flow now; the
  // partner-logged referrals below are legacy.
  const { data: references = [], isLoading: referencesLoading } = useQuery({
    queryKey: ["ceo-partner-references"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_references" as never)
        .select("*, partner:partners(id, full_name, company_name, bank_account_number), meeting:meetings(id, company_name, meeting_date, prospect_name)")
        .order("created_at", { ascending: false });
      if (error) { if (/does not exist|schema cache/i.test(error.message)) return []; throw error; }
      return (data ?? []) as unknown as Array<PartnerReference & { partner: { id: string; full_name: string; company_name: string | null; bank_account_number: string | null } | null; meeting: { id: string; company_name: string; meeting_date: string; prospect_name: string } | null }>;
    },
  });
  const [feeSavingId, setFeeSavingId] = useState<string | null>(null);
  const toggleFee = async (id: string, current: string) => {
    setFeeSavingId(id);
    const paid = current !== "paid";
    const { error } = await supabase.from("partner_references" as never).update({ fee_status: paid ? "paid" : "unpaid", fee_paid_at: paid ? new Date().toISOString() : null, updated_at: new Date().toISOString() } as never).eq("id", id);
    setFeeSavingId(null);
    if (error) toast.error(error.message); else { toast.success(paid ? "Fee marked paid" : "Fee marked unpaid"); queryClient.invalidateQueries({ queryKey: ["ceo-partner-references"] }); }
  };

  const { data: referrals, isLoading: referralsLoading } = useQuery({
    queryKey: ["ceo-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*, partner:partners(full_name, company_name), discovery:meetings!referrals_discovery_id_fkey(meeting_date, attendance_status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: partnerDocs } = useQuery({
    queryKey: ["ceo-partner-documents", uploadPartnerId],
    enabled: !!uploadPartnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_documents")
        .select("id, file_url, file_name, doc_type, uploaded_at")
        .eq("partner_id", uploadPartnerId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading || capLoading) return null;
  if (!isCEOUser(user?.id) && !canViewCEO) return <Navigate to="/admin" replace />;

  const savePayoutAmount = async (referralId: string) => {
    const raw = payoutDrafts[referralId];
    if (raw === undefined) return;
    const amount = raw.trim() === "" ? null : Number(raw);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      toast.error("Enter a valid payout amount");
      return;
    }
    setSavingId(referralId);
    try {
      const { error } = await supabase
        .from("referrals")
        .update({ payout_amount: amount })
        .eq("id", referralId);
      if (error) throw error;
      toast.success("Payout amount saved");
      setPayoutDrafts((prev) => {
        const next = { ...prev };
        delete next[referralId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["ceo-referrals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save payout amount");
    } finally {
      setSavingId(null);
    }
  };

  const togglePayoutStatus = async (referralId: string, currentStatus: string) => {
    const markingPaid = currentStatus !== "paid";
    setSavingId(referralId);
    try {
      const { error } = await supabase
        .from("referrals")
        .update({
          payout_status: markingPaid ? "paid" : "unpaid",
          payout_date: markingPaid ? format(new Date(), "yyyy-MM-dd") : null,
        })
        .eq("id", referralId);
      if (error) throw error;
      toast.success(markingPaid ? "Marked as paid" : "Marked as unpaid");
      queryClient.invalidateQueries({ queryKey: ["ceo-referrals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update payout status");
    } finally {
      setSavingId(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadPartnerId || !uploadFile) return;
    setUploading(true);
    try {
      const safeName = uploadFile.name.replace(/[^\w.\-() ]+/g, "_");
      const filePath = `${uploadPartnerId}/${Date.now()}_${safeName}`;
      const { error: storageError } = await supabase.storage
        .from("partner-documents")
        .upload(filePath, uploadFile);
      if (storageError) throw storageError;

      const { error: rowError } = await supabase.from("partner_documents").insert({
        partner_id: uploadPartnerId,
        file_url: filePath,
        file_name: uploadFile.name,
        doc_type: uploadDocType,
        uploaded_by: user?.id ?? null,
      });
      if (rowError) {
        // Don't leave an orphaned object the document list can never show
        await supabase.storage.from("partner-documents").remove([filePath]);
        throw rowError;
      }

      toast.success("Document uploaded");
      setUploadFile(null);
      setFileInputKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["ceo-partner-documents", uploadPartnerId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

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

  const loading = referralsLoading || partnersLoading;
  const rows = referrals || [];

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Referrals" subtitle="Prospects you've pointed to a partner as a reference · finder's fees · documents" />

        <div className="space-y-6">
          <Panel
            title="References"
            meta='Created when you answer "Is this a reference?" on a discovery outcome. Status follows the deal; mark the fee paid here.'
            aside={<span className="flex gap-[5px]">
              {references.length > 0 && <Pill>{references.length}</Pill>}
              {references.some((r) => r.status === "closed_won" && r.fee_status !== "paid") && (
                <Pill variant="warn">£{references.filter((r) => r.status === "closed_won" && r.fee_status !== "paid").reduce((s, r) => s + Number(r.fee_amount || 0), 0)} owed</Pill>
              )}
            </span>}
          >
            <div className="pt-2">
              {referencesLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : references.length === 0 ? (
                <EmptyState icon={Handshake} title="No references yet" description="Log a discovery outcome and answer Yes to “Is this a reference?”." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Prospect</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {references.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium">{r.partner?.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.partner?.company_name ?? ""}{r.partner && !r.partner.bank_account_number ? " · no bank details" : ""}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div>{r.contact_name || r.meeting?.prospect_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.company_name || r.meeting?.company_name || ""}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.sector || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell><Badge className={REFERENCE_STATUS_STYLES[r.status]}>{REFERENCE_STATUS_LABELS[r.status]}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.status === "closed_won" ? (
                              <div className="flex items-center gap-2">
                                <Badge className={r.fee_status === "paid" ? REFERENCE_STATUS_STYLES.closed_won : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"}>
                                  £{Number(r.fee_amount)} · {r.fee_status === "paid" ? `paid${r.fee_paid_at ? ` ${format(new Date(r.fee_paid_at), "dd MMM")}` : ""}` : "due"}
                                </Badge>
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={feeSavingId === r.id} onClick={() => toggleFee(r.id, r.fee_status)}>
                                  {feeSavingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : r.fee_status === "paid" ? "Mark unpaid" : "Mark paid"}
                                </Button>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">£{Number(r.fee_amount)} if they sign</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="Legacy referrals"
            meta="Partner-logged referrals from before 18 Sep. Kept for the payout record; partners can no longer log new ones."
            aside={rows.length > 0 ? <Pill>{rows.length}</Pill> : undefined}
          >
            <div className="pt-2">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={Handshake}
                  title="No referrals yet"
                  description="Partner-submitted referrals will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Date Referred</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Discovery</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Payout Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((referral) => {
                        const partnerName =
                          referral.partner?.company_name || referral.partner?.full_name || "—";
                        const draft = payoutDrafts[referral.id];
                        const payoutValue =
                          draft !== undefined
                            ? draft
                            : referral.payout_amount != null
                              ? String(referral.payout_amount)
                              : "";
                        const isSaving = savingId === referral.id;
                        return (
                          <TableRow key={referral.id}>
                            <TableCell className="font-medium whitespace-nowrap">{partnerName}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div>{referral.contact_full_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {[referral.contact_mobile, referral.contact_email].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{referral.referred_company_name}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(referral.date_referred), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell>
                              <Badge className={REFERRAL_STATUS_STYLES[referral.status] || REFERRAL_STATUS_STYLES.submitted}>
                                {REFERRAL_STATUS_LABELS[referral.status] || referral.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {referral.discovery ? (
                                <span className="text-sm">
                                  {format(new Date(referral.discovery.meeting_date), "dd MMM yyyy")}
                                  {referral.discovery.attendance_status && referral.discovery.attendance_status !== "pending"
                                    ? ` · ${referral.discovery.attendance_status}`
                                    : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  min="0"
                                  value={payoutValue}
                                  placeholder="£"
                                  onChange={(e) =>
                                    setPayoutDrafts((prev) => ({ ...prev, [referral.id]: e.target.value }))
                                  }
                                  className="h-8 w-24 bg-secondary border-border"
                                  disabled={isSaving}
                                />
                                {draft !== undefined && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => savePayoutAmount(referral.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={
                                    referral.payout_status === "paid"
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                      : "bg-muted text-muted-foreground border-border"
                                  }
                                >
                                  {referral.payout_status === "paid"
                                    ? `Paid${referral.payout_date ? ` ${format(new Date(referral.payout_date), "dd MMM")}` : ""}`
                                    : "Unpaid"}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => togglePayoutStatus(referral.id, referral.payout_status)}
                                  disabled={isSaving}
                                >
                                  {referral.payout_status === "paid" ? "Mark unpaid" : "Mark paid"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="Partner documents"
            meta="Upload contracts and proof of payment into a partner's folder. This is the only upload point; partners see these read-only in their portal."
          >
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="space-y-2">
                  <Label>Partner</Label>
                  <Select value={uploadPartnerId} onValueChange={setUploadPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                    <SelectContent>
                      {(partners || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                          {p.company_name ? ` (${p.company_name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Document type</Label>
                  <Select value={uploadDocType} onValueChange={setUploadDocType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="proof_of_payment">Proof of Payment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input
                    key={fileInputKey}
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={!uploadPartnerId || !uploadFile || uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>

              {uploadPartnerId && (
                <div className="space-y-2">
                  {(partnerDocs || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No documents uploaded for this partner yet.
                    </p>
                  ) : (
                    (partnerDocs || []).map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate">{doc.file_name}</span>
                          <Badge className={DOC_TYPE_STYLES[doc.doc_type] || DOC_TYPE_STYLES.other}>
                            {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(doc.file_url, doc.file_name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
