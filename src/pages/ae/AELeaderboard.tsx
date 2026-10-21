import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LeaderboardPodium } from "@/components/operations/leaderboard/LeaderboardPodium";
import { useAuth } from "@/contexts/AuthContext";
import { AchievementInfoModal } from "@/components/achievements/AchievementInfoModal";
import { useAvatarMap } from "@/hooks/useAvatarMap";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

interface AELeaderboardEntry {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  total_closes: number;
  contract_value: number;
  conversion_rate: number;
}

export default function AELeaderboard() {
  const [period, setPeriod] = useState<"daily" | "monthly">("monthly");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const { user } = useAuth();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["ae-leaderboard", period],
    queryFn: async () => {
      const today = new Date();
      let start: string;
      let end: string;

      if (period === "daily") {
        start = end = format(today, "yyyy-MM-dd");
      } else {
        start = format(startOfMonth(today), "yyyy-MM-dd");
        end = format(endOfMonth(today), "yyyy-MM-dd");
      }

      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const aeUserIds = await fetchActiveAeUserIds();
      if (aeUserIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", aeUserIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const { data: overrides } = await supabase
        .from("ae_metrics_overrides")
        .select("ae_user_id, total_closes, contract_value, lead_followups, created_at")
        .in("ae_user_id", aeUserIds)
        .lte("period_start", end)
        .gte("period_end", start)
        .order("created_at", { ascending: false });

      const overrideMap = new Map<string, (typeof overrides)[number]>();
      (overrides || []).forEach((o) => {
        if (!overrideMap.has(o.ae_user_id)) overrideMap.set(o.ae_user_id, o);
      });

      const { data: pitchCloses } = await supabase
        .from("pitch_calls")
        .select("contract_value, created_by")
        .eq("converted_to_client", true)
        .gte("updated_at", `${start}T00:00:00`)
        .lte("updated_at", `${end}T23:59:59`);

      const { data: followUps } = await supabase
        .from("sales_discovery_logs")
        .select("id, assigned_ae_id")
        .in("client_interest", ["interested", "unsure"])
        .gte("meeting_at", `${start}T00:00:00`)
        .lte("meeting_at", `${end}T23:59:59`);

      // Group follow-ups by AE for per-AE conversion rates
      const followUpsByAE = new Map<string, number>();
      followUps?.forEach((fu: any) => {
        if (fu.assigned_ae_id) {
          followUpsByAE.set(fu.assigned_ae_id, (followUpsByAE.get(fu.assigned_ae_id) || 0) + 1);
        }
      });

      const aeStats: Map<string, { closes: number; value: number }> = new Map();
      aeUserIds.forEach((id) => aeStats.set(id, { closes: 0, value: 0 }));

      pitchCloses?.forEach((pc) => {
        if (pc.created_by && aeStats.has(pc.created_by)) {
          const current = aeStats.get(pc.created_by)!;
          aeStats.set(pc.created_by, {
            closes: current.closes + 1,
            value: current.value + (pc.contract_value || 0),
          });
        }
      });

      overrideMap.forEach((o, aeUserId) => {
        if (!aeStats.has(aeUserId)) return;
        aeStats.set(aeUserId, {
          closes: o.total_closes || 0,
          value: o.contract_value || 0,
        });
      });

      const entries: AELeaderboardEntry[] = aeUserIds.map((userId) => {
        const profile = profileMap.get(userId);
        const stats = aeStats.get(userId) || { closes: 0, value: 0 };
        const override = overrideMap.get(userId);
        const denominator = override?.lead_followups ?? (followUpsByAE.get(userId) || 0);
        const convRate = denominator > 0 ? Math.round((stats.closes / denominator) * 100) : 0;
        return {
          user_id: userId,
          email: profile?.email || "",
          full_name: profile?.full_name || "Unknown",
          avatar_url: profile?.avatar_url,
          total_closes: stats.closes,
          contract_value: stats.value,
          conversion_rate: convRate,
        };
      });

      return entries.sort((a, b) => {
        if (b.contract_value !== a.contract_value) return b.contract_value - a.contract_value;
        return b.total_closes - a.total_closes;
      });
    },
  });

  const formatCurrency = (value: number) => {
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Leaderboard"
          subtitle="Account Executive performance rankings"
          actions={
            <ButtonV2 size="sm" variant="ghost" onClick={() => setShowInfoModal(true)}>How it works</ButtonV2>
          }
        />

        <AchievementInfoModal open={showInfoModal} onOpenChange={setShowInfoModal} context="leaderboard" />

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Period Toggle */}
            <div className="flex items-center justify-center">
              <Tabs value={period} onValueChange={(v) => setPeriod(v as "daily" | "monthly")}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Podium – uses contract_value as the primary metric */}
            <LeaderboardPodium
              entries={(leaderboard || []).map((e, i) => ({
                name: e.full_name,
                email: e.email,
                avatar_url: e.avatar_url,
                contract_value: e.contract_value,
                rank: i + 1,
                primaryValue: formatCurrency(e.contract_value),
              }))}
              metricKey="primaryValue"
              metricLabel="Contract Value"
              currentUserEmail={user?.email}
            />

            {/* Rankings Table */}
            <Panel title="Rankings" meta={period === "daily" ? "Today" : "This month"}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Closes</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leaderboard || []).map((entry, index) => {
                    const isCurrentUser = entry.user_id === user?.id;
                    return (
                      <TableRow
                        key={entry.user_id}
                        className={cn(
                          "relative leaderboard-row",
                          isCurrentUser ? "bg-primary/5 border-primary/20" : ""
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center justify-center">
                            {index < 3 ? (
                              <div
                                className="rank-circle"
                                style={{
                                  background: index === 0 ? "#F4C430" : index === 1 ? "#C0C0C0" : "#CD7F32",
                                  color: index === 0 ? "#000" : index === 1 ? "#000" : "#fff",
                                }}
                              >
                                {index + 1}
                              </div>
                            ) : (
                              <div className="rank-circle">
                                {index + 1}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar name={entry.full_name} avatarUrl={entry.avatar_url} size="sm" />
                            <div>
                              <p className={`font-semibold ${isCurrentUser ? "text-primary" : ""}`}>{entry.full_name}</p>
                              <p className="text-xs text-muted-foreground">{entry.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold">{entry.total_closes}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-primary">{formatCurrency(entry.contract_value)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill variant={entry.conversion_rate >= 30 ? "ok" : "default"}>{entry.conversion_rate}%</Pill>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!leaderboard || leaderboard.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        No data available yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Panel>
          </div>
        )}
      </PageContainer>
    </DashboardLayout>
  );
}
