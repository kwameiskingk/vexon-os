import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useGreeting } from "@/hooks/useGreeting";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { CheckCircle, Clock, Users, Briefcase, UserCog, Shield } from "lucide-react";

interface CategoryStatus {
  label: string;
  icon: React.ElementType;
  total: number;
  completed: number;
  lastSubmission: string | null;
}

const OpsAssistantDashboard = () => {
  const { fullGreeting } = useGreeting();
  const { user } = useAuth();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Fetch acquisition setters
  const { data: acqSetters = [] } = useQuery({
    queryKey: ["ops-acq-setters"],
    queryFn: async () => {
      const { data } = await supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, department")
        .eq("active", true)
        .eq("is_test_account", false)
        .eq("department", "acquisition");
      return data || [];
    },
  });

  // Fetch AEs
  const { data: aes = [] } = useQuery({
    queryKey: ["ops-aes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "account_executive");
      if (!data?.length) return [];
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return profiles || [];
    },
  });

  // Fetch SDR Managers
  const { data: sdrManagers = [] } = useQuery({
    queryKey: ["ops-sdr-managers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr_manager");
      if (!data?.length) return [];
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return profiles || [];
    },
  });

  // Fetch Ops/HR users
  const { data: opsHrUsers = [] } = useQuery({
    queryKey: ["ops-hr-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["ops", "hr"]);
      if (!data?.length) return [];
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return profiles || [];
    },
  });

  // Fetch yesterday's manual_daily_metrics
  const { data: metrics = [] } = useQuery({
    queryKey: ["ops-dashboard-metrics", yesterday],
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_daily_metrics")
        .select("target_user_id, target_role, created_at, updated_at")
        .eq("date", yesterday);
      return data || [];
    },
  });

  const getCompletedCount = (userIds: string[], role: string) => {
    return userIds.filter((uid) =>
      metrics.some((m) => m.target_user_id === uid && m.target_role === role)
    ).length;
  };

  const getLastSubmission = (role: string) => {
    const rolMetrics = metrics
      .filter((m) => m.target_role === role)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return rolMetrics.length > 0
      ? format(new Date(rolMetrics[0].updated_at), "h:mm a")
      : null;
  };

  const categories: CategoryStatus[] = [
    {
      label: "Acquisition Setters",
      icon: Users,
      total: acqSetters.length,
      completed: getCompletedCount(
        acqSetters.map((s) => s.user_id).filter(Boolean) as string[],
        "setter"
      ),
      lastSubmission: getLastSubmission("setter"),
    },
    {
      label: "Account Executives",
      icon: Briefcase,
      total: aes.length,
      completed: getCompletedCount(
        aes.map((a) => a.id),
        "account_executive"
      ),
      lastSubmission: getLastSubmission("account_executive"),
    },
    {
      label: "SDR Manager",
      icon: UserCog,
      total: sdrManagers.length,
      completed: getCompletedCount(
        sdrManagers.map((s) => s.id),
        "sdr_manager"
      ),
      lastSubmission: getLastSubmission("sdr_manager"),
    },
    {
      label: "HR / Ops",
      icon: Shield,
      total: opsHrUsers.length,
      completed: getCompletedCount(
        opsHrUsers.map((u) => u.id),
        "ops"
      ),
      lastSubmission: getLastSubmission("ops"),
    },
  ];

  const totalUsers = categories.reduce((s, c) => s + c.total, 0);
  const totalCompleted = categories.reduce((s, c) => s + c.completed, 0);

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title={fullGreeting}
          subtitle={`Yesterday's submission status (${format(new Date(yesterday), "EEEE, MMM d")})`}
        />

        {/* Overall progress */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Progress</p>
                <p className="text-2xl font-bold">
                  {totalCompleted} / {totalUsers}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                {totalCompleted === totalUsers && totalUsers > 0 ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : (
                  <Clock className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            </div>
            {totalUsers > 0 && (
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(totalCompleted / totalUsers) * 100}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const allDone = cat.completed === cat.total && cat.total > 0;
            return (
              <Card key={cat.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{cat.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {cat.completed} of {cat.total} complete
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={allDone ? "default" : "secondary"}
                      className={allDone ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20" : ""}
                    >
                      {allDone ? "Done" : "Pending"}
                    </Badge>
                  </div>
                  {cat.total > 0 && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${(cat.completed / cat.total) * 100}%` }}
                      />
                    </div>
                  )}
                  {cat.lastSubmission && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last entry at {cat.lastSubmission}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default OpsAssistantDashboard;
