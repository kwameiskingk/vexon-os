// Partner portal → References (18 Sep 2026). Partners are references, not
// referrers: Marcus pushes a prospect's details here from his discovery
// outcome; the partner takes the call and, if the deal closes, earns a fee.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { formatPayout } from "@/lib/referrals";
import { Building2, Handshake, Linkedin, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export interface PartnerReference {
  id: string; partner_id: string; meeting_id: string | null; contact_name: string | null; company_name: string | null;
  sector: string | null; mobile: string | null; linkedin_url: string | null; email: string | null; pain_points: string | null;
  note: string | null; status: "requested" | "spoken" | "closed_won" | "closed_lost"; fee_amount: number; fee_status: "unpaid" | "paid";
  fee_paid_at: string | null; created_at: string;
}
export const REFERENCE_STATUS_LABELS: Record<string, string> = { requested: "Waiting for their call", spoken: "Spoken to them", closed_won: "They signed", closed_lost: "Didn't proceed" };
export const REFERENCE_STATUS_STYLES: Record<string, string> = {
  requested: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  spoken: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  closed_won: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  closed_lost: "bg-muted text-muted-foreground border-border",
};

export function usePartnerReferences(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-references", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerReference[]> => {
      const { data, error } = await supabase.from("partner_references" as never).select("*").eq("partner_id", partnerId!).order("created_at", { ascending: false });
      if (error) { if (/does not exist|schema cache/i.test(error.message)) return []; throw error; }
      return (data ?? []) as unknown as PartnerReference[];
    },
  });
}

const PartnerReferences = () => {
  const qc = useQueryClient();
  const { partner, isLoading: partnerLoading } = usePartnerProfile();
  const { data: refs = [], isLoading } = usePartnerReferences(partner?.id);
  const loading = partnerLoading || isLoading;

  const markSpoken = async (id: string) => {
    const { error } = await supabase.from("partner_references" as never).update({ status: "spoken", updated_at: new Date().toISOString() } as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Thanks — noted"); qc.invalidateQueries({ queryKey: ["partner-references", partner?.id] }); }
  };

  return (
    <DashboardLayout role="partner">
      <PageContainer>
        <PageHeader title="References" subtitle="Prospects Marcus has pointed to you. Take the call; if they sign, a finder's fee comes to you." />
        {loading ? <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        : refs.length === 0 ? <EmptyState icon={Handshake} title="No references yet" description="When a prospect asks to speak to a current client, their details will appear here and you'll get an email." />
        : (
          <div className="space-y-3">
            {refs.map((r) => (
              <Card key={r.id} className="border-border shadow-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.contact_name || "Prospect"}{r.company_name ? ` · ${r.company_name}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{r.sector ? `${r.sector} · ` : ""}Sent {format(new Date(r.created_at), "dd MMM yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={REFERENCE_STATUS_STYLES[r.status]}>{REFERENCE_STATUS_LABELS[r.status]}</Badge>
                      {r.status === "closed_won" && <Badge className={r.fee_status === "paid" ? REFERENCE_STATUS_STYLES.closed_won : "bg-muted text-muted-foreground border-border"}>{r.fee_status === "paid" ? "Fee paid" : "Fee due"} · {formatPayout(Number(r.fee_amount))}</Badge>}
                    </div>
                  </div>
                  <div className="grid gap-1 text-sm sm:grid-cols-3">
                    {r.mobile && <a href={`tel:${r.mobile}`} className="flex items-center gap-1.5 hover:underline"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{r.mobile}</a>}
                    {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 truncate hover:underline"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{r.email}</a>}
                    {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate hover:underline"><Linkedin className="h-3.5 w-3.5 text-muted-foreground" />LinkedIn</a>}
                  </div>
                  {r.pain_points && <p className="text-sm"><span className="text-muted-foreground">What's hurting them: </span>{r.pain_points}</p>}
                  {r.note && <p className="text-sm"><span className="text-muted-foreground">From Marcus: </span>{r.note}</p>}
                  {r.status === "requested" && <Button size="sm" variant="outline" onClick={() => markSpoken(r.id)}>I've spoken to them</Button>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageContainer>
    </DashboardLayout>
  );
};
export default PartnerReferences;
