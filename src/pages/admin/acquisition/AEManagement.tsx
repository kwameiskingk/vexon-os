import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import {
  User,
  Phone,
  PhoneForwarded,
  Trophy,
  PoundSterling,
  Target,
  Settings,
} from "lucide-react";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import { AEMetricsOverrideModal } from "@/components/ae/AEMetricsOverrideModal";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

interface AECardData {
  id: string;
  full_name: string;
  email: string;
  base_salary: number;
  cash_collected_goal: number;
  discoveriesSet: number;
  followUpsSet: number;
  dealsClosed: number;
  cashCollected: number;
}

export function AEManagementView({ basePath = "/admin/sales/ae-management" }: { basePath?: string }) {
  const navigate = useNavigate();

  const { start, end } = getCommissionCycleDates();
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const { data: aeCards, isLoading } = useQuery({
    queryKey: ["ae-management-cards", startStr, endStr],
    queryFn: async () => {
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (userIds.length === 0) return [];

      const [profilesRes, compensationRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", userIds),
        supabase.from("ae_compensation").select("user_id, base_salary, cash_collected_goal").in("user_id", userIds),
      ]);

      const profiles = profilesRes.data || [];
      const compensations = (compensationRes.data || []) as Array<{ user_id: string; base_salary: number | null; cash_collected_goal: number | null }>;

      const results = await Promise.all(
        profiles.map(async (p) => {
          const { data: aeMeetings } = await supabase
            .from("meetings")
            .select("id")
            .eq("assigned_ae_id", p.id)
            .eq("department", "acquisition")
            .gte("meeting_date", startStr)
            .lte("meeting_date", endStr);

          const meetingIds = (aeMeetings || []).map((meeting) => meeting.id);
          const discoveriesSet = meetingIds.length;

          let followUpsSet = 0;
          let dealsClosed = 0;
          let cashCollected = 0;

          if (meetingIds.length > 0) {
            const { data: logs } = await supabase
              .from("sales_discovery_logs")
              .select("id, converted_to_client, follow_up_date, contract_value, updated_at")
              .in("meeting_id", meetingIds);

            const logsArr = logs || [];
            const logIds = logsArr.map((log) => log.id);

            followUpsSet = logsArr.filter((log) => log.follow_up_date).length;

            const convertedDiscoveryLogsInCycle = logsArr.filter(
              (log) =>
                log.converted_to_client === true &&
                log.updated_at >= `${startStr}T00:00:00` &&
                log.updated_at <= `${endStr}T23:59:59`,
            );

            let pitchClosesInCycle: Array<{
              id: string;
              discovery_log_id: string | null;
              contract_value: number | null;
              updated_at: string;
            }> = [];

            if (logIds.length > 0) {
              const { data: pitchCalls } = await supabase
                .from("pitch_calls")
                .select("id, discovery_log_id, contract_value, updated_at")
                .in("discovery_log_id", logIds)
                .eq("converted_to_client", true)
                .gte("updated_at", `${startStr}T00:00:00`)
                .lte("updated_at", `${endStr}T23:59:59`);

              pitchClosesInCycle = pitchCalls || [];
            }

            const uniqueConvertedDeals = getUniqueConvertedDeals(
              pitchClosesInCycle,
              convertedDiscoveryLogsInCycle,
            );

            dealsClosed = uniqueConvertedDeals.length;
            cashCollected = sumConvertedDealValue(uniqueConvertedDeals);
          }

          const comp = compensations.find((compensation) => compensation.user_id === p.id);

          return {
            id: p.id,
            full_name: p.full_name || p.email?.split("@")[0] || "Unknown",
            email: p.email || "",
            base_salary: comp?.base_salary || 0,
            cash_collected_goal: comp?.cash_collected_goal || 0,
            discoveriesSet,
            followUpsSet,
            dealsClosed,
            cashCollected,
          };
        }),
      );

      return results;
    },
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-6">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : !aeCards?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No account executives found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {aeCards.map((ae) => {
            const goalPct = ae.cash_collected_goal > 0
              ? Math.min(Math.round((ae.cashCollected / ae.cash_collected_goal) * 100), 100)
              : 0;

            return (
              <Card
                key={ae.id}
                className="cursor-pointer hover:border-primary/40 transition-colors border-border/50"
                onClick={() => navigate(`${basePath}/${ae.id}`)}
              >
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {getInitials(ae.full_name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{ae.full_name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{ae.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <PoundSterling className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Base Salary:</span>
                    <span className="font-medium">£{ae.base_salary.toLocaleString()}</span>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Phone className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-xl font-bold text-foreground">{ae.discoveriesSet}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Disco Set</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <PhoneForwarded className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-xl font-bold text-foreground">{ae.followUpsSet}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Follow-up</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Trophy className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-xl font-bold text-foreground">{ae.dealsClosed}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Closed</p>
                    </div>
                  </div>

                  {ae.cash_collected_goal > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Target className="h-3 w-3" /> Cash Goal
                        </span>
                        <span className="font-medium">
                          £{ae.cashCollected.toLocaleString()} / £{ae.cash_collected_goal.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={goalPct} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AEManagement() {
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const { start, end } = getCommissionCycleDates();

  return (
    <DashboardLayout role="admin">
      <PageHeader
        title="AE Management"
        subtitle={`Commission cycle: ${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`}
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowOverrideModal(true)}
            title="AE Metrics Override"
          >
            <Settings className="h-4 w-4" />
          </Button>
        }
      />

      <AEMetricsOverrideModal open={showOverrideModal} onOpenChange={setShowOverrideModal} />

      <AEManagementView />
    </DashboardLayout>
  );
}
