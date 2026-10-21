import { useState } from "react";
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
import { LogReferralModal } from "@/components/partner/LogReferralModal";
import {
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUS_STYLES,
  PAYOUT_STATUS_LABELS,
  PAYOUT_STATUS_STYLES,
  formatPayout,
} from "@/lib/referrals";
import { Building2, Handshake, Plus } from "lucide-react";
import { format } from "date-fns";

const PartnerReferrals = () => {
  const queryClient = useQueryClient();
  const { partner, isLoading: partnerLoading } = usePartnerProfile();
  const [logOpen, setLogOpen] = useState(false);

  const { data: referrals, isLoading: referralsLoading } = useQuery({
    queryKey: ["partner-referrals-list", partner?.id],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("partner_id", partner!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const loading = partnerLoading || referralsLoading;

  return (
    <DashboardLayout role="partner">
      <PageContainer>
        <PageHeader
          title="Referrals"
          subtitle="Log new referrals and track their progress"
          actions={
            <Button size="sm" onClick={() => setLogOpen(true)} disabled={!partner}>
              <Plus className="h-4 w-4 mr-1.5" />
              Log a Referral
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : !referrals || referrals.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No referrals yet"
            description="Use the Log a Referral button to refer a company to our team."
          />
        ) : (
          <div className="space-y-3">
            {referrals.map((referral) => (
              <Card key={referral.id} className="border-border shadow-card">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{referral.referred_company_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {referral.contact_full_name}
                        {referral.contact_email ? ` · ${referral.contact_email}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Referred {format(new Date(referral.date_referred), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={REFERRAL_STATUS_STYLES[referral.status] || REFERRAL_STATUS_STYLES.submitted}>
                      {REFERRAL_STATUS_LABELS[referral.status] || referral.status}
                    </Badge>
                    <Badge className={PAYOUT_STATUS_STYLES[referral.payout_status] || PAYOUT_STATUS_STYLES.unpaid}>
                      {referral.payout_amount != null
                        ? `${PAYOUT_STATUS_LABELS[referral.payout_status]} · ${formatPayout(referral.payout_amount)}`
                        : PAYOUT_STATUS_LABELS[referral.payout_status] || referral.payout_status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {partner && (
          <LogReferralModal
            open={logOpen}
            onOpenChange={setLogOpen}
            partnerId={partner.id}
            onLogged={() => {
              queryClient.invalidateQueries({ queryKey: ["partner-referrals-list", partner.id] });
              queryClient.invalidateQueries({ queryKey: ["partner-referrals", partner.id] });
            }}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  );
};

export default PartnerReferrals;
