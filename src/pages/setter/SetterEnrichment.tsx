import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName } from "@/components/ui-v2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Search, Send, ExternalLink, AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { useDevRole } from "@/hooks/useDevRole";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export interface EnrichmentFields {
  full_name: string;
  personal_linkedin: string;
  company_name: string;
  company_domain: string;
}

export interface SetterEnrichmentViewProps {
  requests: any[];
  isAcquisition: boolean;
  usefulLinks: Array<{ id: string; name: string; description?: string | null; url: string }>;
  pollingId: string | null;
  isSearching: boolean;
  duplicateData: any | null;
  onDismissDuplicate: () => void;
  /** Start (or force) an enrichment. Resolves true when the form should clear. */
  onEnrich: (fields: EnrichmentFields, force: boolean) => Promise<boolean>;
  onUseDuplicate: () => void;
  onSendToWarm: (request: any) => Promise<void>;
  /** Re-run a request that timed out (force, so the duplicate check is skipped). */
  onRetry: (request: EnrichmentRetryRow) => Promise<void>;
}

export interface EnrichmentRetryRow {
  full_name?: string | null;
  linkedin_url?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
}

/** A Clay lookup that has not answered in 10 minutes is treated as "no number"
 *  (12 Oct: 50 of 400 requests had sat on "enriching" forever). */
const ENRICHMENT_TIMEOUT_MS = 10 * 60 * 1000;
const isTimedOut = (req: { status: string; created_at: string }) =>
  req.status === "enriching" && Date.now() - new Date(req.created_at).getTime() > ENRICHMENT_TIMEOUT_MS;

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures). Form fields and validation live here;
 * the Clay call, polling and realtime stay in the live wrapper.
 */
export const SetterEnrichmentView = ({
  requests,
  isAcquisition,
  usefulLinks,
  pollingId,
  isSearching,
  duplicateData,
  onDismissDuplicate,
  onEnrich,
  onUseDuplicate,
  onSendToWarm,
  onRetry,
}: SetterEnrichmentViewProps) => {
  const [fullName, setFullName] = useState("");
  const [personalLinkedin, setPersonalLinkedin] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const { toast } = useToast();

  const clearForm = () => {
    setFullName("");
    setPersonalLinkedin("");
    setCompanyName("");
    setCompanyDomain("");
  };

  const submitEnrichment = async (force = false) => {
    const domainCleaned = companyDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const ok = await onEnrich(
      {
        full_name: fullName.trim(),
        personal_linkedin: personalLinkedin.trim(),
        company_name: companyName.trim(),
        company_domain: domainCleaned,
      },
      force,
    );
    if (ok) clearForm();
  };

  const handleSearch = async () => {
    if (!fullName.trim()) {
      toast({ title: "Missing Field", description: "Full Name is required.", variant: "destructive" });
      return;
    }
    if (!personalLinkedin.includes("linkedin.com/")) {
      toast({ title: "Invalid URL", description: "Please enter a valid LinkedIn profile URL.", variant: "destructive" });
      return;
    }
    if (!companyName.trim()) {
      toast({ title: "Missing Field", description: "Company Name is required.", variant: "destructive" });
      return;
    }
    const domainCleaned = companyDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!DOMAIN_REGEX.test(domainCleaned)) {
      toast({ title: "Invalid Domain", description: "Please enter a valid company domain (e.g. acme.com).", variant: "destructive" });
      return;
    }

    await submitEnrichment(false);
  };

  const handleForceEnrich = async () => {
    onDismissDuplicate();
    await submitEnrichment(true);
  };

  const handleUseDuplicate = () => {
    onUseDuplicate();
    clearForm();
    toast({ title: "Using Existing Data", description: "The existing enrichment data is shown in your history below." });
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const handleSendToWarm = (request: any) => onSendToWarm(request);

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader
          title="Tools"
          subtitle="Useful links and data enrichment"
        />
        <div className="space-y-6">
          {/* Useful Links - Acquisition only */}
          {isAcquisition && (
            <Panel title="Useful links" meta="Booking and reference links your admin keeps up to date">
              <div className="pt-1">
                  {usefulLinks.length === 0 ? (
                    <EmptyState
                      icon={Link2}
                      title="No useful links yet"
                      description="Your admin can add booking and reference links from Settings."
                    />
                  ) : (
                    <RowList columns="1fr auto">
                      {usefulLinks.map((link) => (
                        <Row key={link.id}>
                          <RowName primary={link.name} secondary={link.description || undefined} />
                          <div className="flex items-center gap-[6px]">
                            <ButtonV2
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(link.url);
                                toast({ title: "Copied", description: "Link copied to clipboard." });
                              }}
                            >
                              Copy link
                            </ButtonV2>
                            <ButtonV2 size="sm" variant="primary" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}>Open</ButtonV2>
                          </div>
                        </Row>
                      ))}
                    </RowList>
                  )}
              </div>
            </Panel>
          )}

          {/* Data Enrichment - Collapsible */}
          <Panel title="Data enrichment" meta="Find a prospect's number from their name, LinkedIn and company">
            <div className="space-y-6 pt-1">

          {/* Input form */}
          <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                   
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="personalLinkedin">Personal LinkedIn URL *</Label>
                  <Input
                    id="personalLinkedin"
                    placeholder="https://linkedin.com/in/john-doe"
                    value={personalLinkedin}
                    onChange={(e) => setPersonalLinkedin(e.target.value)}
                   
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                   
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyDomain">Company Domain / Website *</Label>
                  <Input
                    id="companyDomain"
                    placeholder="acme.com"
                    value={companyDomain}
                    onChange={(e) => setCompanyDomain(e.target.value)}
                   
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <ButtonV2 variant="primary" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? "Enriching…" : "Enrich"}
                </ButtonV2>
              </div>
          </div>

          {/* Results table */}
          <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>LinkedIn</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">{req.full_name || "—"}</TableCell>
                      <TableCell className="text-sm">{req.company_name || "—"}</TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        <a
                          href={req.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {req.linkedin_url.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        {isTimedOut(req) ? (
                          <Pill>Timed out</Pill>
                        ) : (
                        <Pill variant={req.status === "enriched" ? "ok" : req.status === "error" ? "bad" : req.status === "enriching" ? "info" : "default"}>
                          {req.status === "enriching" ? "Enriching…" : req.status === "not_found" ? "No number" : req.status}
                        </Pill>
                        )}
                      </TableCell>
                      <TableCell>
                        {req.phone_best ? (
                          <span className="inline-flex items-center gap-1">
                            {req.phone_best}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(req.phone_best, "Phone")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </span>
                        ) : req.status === "enriched" || req.status === "not_found" || isTimedOut(req) ? (
                          <span className="text-xs text-muted-foreground italic">No number found</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {(isTimedOut(req) || req.status === "not_found" || req.status === "error") && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" disabled={isSearching} onClick={() => onRetry(req)}>
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Try again</TooltipContent>
                            </Tooltip>
                          )}
                          {req.status === "enriched" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleSendToWarm(req)}>
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Send to Warm Leads</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>

                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState
                          icon={Search}
                          title="No enrichment requests yet"
                          description="Enter prospect details above to get started."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
          </div>
            </div>
          </Panel>

        </div>

        <Dialog open={!!duplicateData} onOpenChange={(open) => !open && onDismissDuplicate()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Contact Already Enriched
              </DialogTitle>
              <DialogDescription>
                This contact has already been enriched. Using existing data won't consume a credit.
              </DialogDescription>
            </DialogHeader>
            {duplicateData && (
              <div className="space-y-3 rounded-md border p-4 bg-muted/50">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{duplicateData.full_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Company:</span>{" "}
                    <span className="font-medium">{duplicateData.company_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    <span className="font-medium">{duplicateData.phone_best || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Domain:</span>{" "}
                    <span className="font-medium">{duplicateData.company_domain || "—"}</span>
                  </div>
                </div>
                <a
                  href={duplicateData.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm inline-flex items-center gap-1"
                >
                  View LinkedIn <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleUseDuplicate}>
                Use Existing Data
              </Button>
              <Button variant="destructive" onClick={handleForceEnrich}>
                Re-Enrich (Uses 1 Credit)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

const SetterEnrichment = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [duplicateData, setDuplicateData] = useState<any | null>(null);
  const { toast } = useToast();
  const { userId } = useDevRole();

  const loadRequests = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("enrichment_requests")
      .select("*")
      .eq("created_by_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setRequests(data);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Determine setter's department for gating Useful Links
  const { data: setterDept } = useQuery({
    queryKey: ["setter-department-self"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("setters_profiles")
        .select("department")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.department || "").toLowerCase();
    },
  });

  const isAcquisition = setterDept === "acquisition";

  const { data: usefulLinks = [] } = useQuery({
    queryKey: ["useful-links-setter", "acquisition"],
    enabled: isAcquisition,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_useful_links")
        .select("id, name, description, url")
        .eq("department", "acquisition")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Polling logic
  useEffect(() => {
    if (!pollingId) return;

    let attempts = 0;
    const maxAttempts = 100; // ~5 minutes at 3s intervals
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from("enrichment_requests")
        .select("*")
        .eq("id", pollingId)
        .maybeSingle();

      if (data && ["enriched", "not_found", "error"].includes(data.status)) {
        setPollingId(null);
        clearInterval(interval);
        loadRequests();
            if (data.status === "enriched") {
          toast({ title: "Enrichment Complete", description: "Phone/email data found!" });
        } else if (data.status === "not_found") {
          toast({ title: "No Data Found", description: "No phone or email was found for this profile.", variant: "destructive" });
        } else {
          toast({ title: "Enrichment Error", description: data.error_message || "Something went wrong.", variant: "destructive" });
        }
      } else if (attempts >= maxAttempts) {
        setPollingId(null);
        clearInterval(interval);
        loadRequests();
        toast({
          title: "Still working…",
          description: "Clay is taking longer than usual. This row will update automatically when it finishes.",
        });
      } else {
        loadRequests();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pollingId, loadRequests, toast]);

  // Realtime subscription: keep the history table fresh even after polling stops
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`enrichment_requests:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrichment_requests", filter: `created_by_user_id=eq.${userId}` },
        () => {
          loadRequests();
              }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadRequests]);


  /** Resolves true when the form should clear (an enrichment was started). */
  const submitEnrichment = async (fields: EnrichmentFields, force = false): Promise<boolean> => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("start-enrichment", {
        body: { ...fields, force },
      });

      // Supabase returns a FunctionsHttpError for non-2xx responses (e.g. 409 duplicate, 429 limit).
      // The actual JSON body is on error.context (a Response object). Parse it so we can show the
      // structured message instead of a generic "non-2xx status code" error.
      let payload: any = data;
      if (error) {
        try {
          if (error.context && typeof error.context.json === "function") {
            payload = await error.context.json();
          }
        } catch {
          payload = null;
        }

        if (!payload) {
          throw new Error(error.message || "Failed to start enrichment.");
        }
      }

      // Check for duplicate response
      if (payload?.error === "duplicate_found") {
        setDuplicateData(payload.existing);
        return false;
      }

      if (payload?.error) {
        throw new Error(payload.message || payload.error);
      }

      setPollingId(payload.request_id);
      loadRequests();
      toast({ title: "Enrichment Started", description: "Searching for contact data..." });
      return true;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start enrichment.", variant: "destructive" });
      return false;
    } finally {
      setIsSearching(false);
    }
  };

  const handleRetry = async (request: EnrichmentRetryRow) => {
    await submitEnrichment(
      {
        full_name: request.full_name || "",
        personal_linkedin: request.linkedin_url || "",
        company_name: request.company_name || "",
        company_domain: request.company_domain || "",
      },
      true,
    );
  };

  const handleSendToWarm = async (request: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("warm_leads").insert({
      created_by_user_id: user.id,
      linkedin_url: request.linkedin_url,
      phone: request.phone_best,
      email: request.email,
      source: request.source,
      enrichment_request_id: request.id,
      full_name: request.full_name,
      company_name: request.company_name,
      company_domain: request.company_domain,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Lead sent to Warm Leads!" });
    }
  };

  return (
    <SetterEnrichmentView
      requests={requests}
      isAcquisition={isAcquisition}
      usefulLinks={usefulLinks}
      pollingId={pollingId}
      isSearching={isSearching}
      duplicateData={duplicateData}
      onDismissDuplicate={() => setDuplicateData(null)}
      onEnrich={submitEnrichment}
      onUseDuplicate={() => { setDuplicateData(null); loadRequests(); }}
      onSendToWarm={handleSendToWarm}
      onRetry={handleRetry}
    />
  );
};

export default SetterEnrichment;
