import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { AcquisitionSettersTab } from "@/components/ops-assistant/AcquisitionSettersTab";
import { AccountExecutivesTab } from "@/components/ops-assistant/AccountExecutivesTab";
import { SDRManagerTab } from "@/components/ops-assistant/SDRManagerTab";
import { HROpsTab } from "@/components/ops-assistant/HROpsTab";
import { DuplicateMetricModal } from "@/components/ops-assistant/DuplicateMetricModal";

const OpsAssistantMetricsInput = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Duplicate modal state
  const [duplicateModal, setDuplicateModal] = useState<{
    open: boolean;
    userName: string;
    date: string;
    onConfirm: () => void;
  }>({ open: false, userName: "", date: "", onConfirm: () => {} });

  // Fetch existing metrics for selected date
  const { data: existingMetrics = [] } = useQuery({
    queryKey: ["manual-daily-metrics", dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_daily_metrics")
        .select("*")
        .eq("date", dateStr);
      return data || [];
    },
  });

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
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (!userIds.length) return [];
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
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr_manager");
      if (!roles?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", roles.map((r) => r.user_id));
      return profiles || [];
    },
  });

  // Fetch Ops/HR users
  const { data: opsHrUsers = [] } = useQuery({
    queryKey: ["ops-hr-users"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["ops", "hr"]);
      if (!roles?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", roles.map((r) => r.user_id));
      return profiles || [];
    },
  });

  const completedSetters = acqSetters.filter((s) =>
    existingMetrics.some((m) => m.target_user_id === s.user_id && m.target_role === "setter")
  ).length;
  const completedAEs = aes.filter((a) =>
    existingMetrics.some((m) => m.target_user_id === a.id && m.target_role === "account_executive")
  ).length;
  const completedSDR = sdrManagers.filter((s) =>
    existingMetrics.some((m) => m.target_user_id === s.id && m.target_role === "sdr_manager")
  ).length;
  const completedOps = opsHrUsers.filter((u) =>
    existingMetrics.some((m) => m.target_user_id === u.id && m.target_role === "ops")
  ).length;

  const refreshMetrics = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["manual-daily-metrics", dateStr] });
  }, [queryClient, dateStr]);

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Metrics Input" subtitle="Enter verified daily metrics" />

        {/* Date Picker — prominent */}
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <CalendarIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">Metrics date:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-[200px] justify-start text-left font-medium", !selectedDate && "text-muted-foreground")}
              >
                {format(selectedDate, "EEEE, MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="setters" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setters" className="gap-1.5 text-xs sm:text-sm">
              Setters
              <Badge variant="secondary" className="ml-1 text-xs">
                {completedSetters}/{acqSetters.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="aes" className="gap-1.5 text-xs sm:text-sm">
              AEs
              <Badge variant="secondary" className="ml-1 text-xs">
                {completedAEs}/{aes.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="sdr" className="gap-1.5 text-xs sm:text-sm">
              SDR Manager
              <Badge variant="secondary" className="ml-1 text-xs">
                {completedSDR}/{sdrManagers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="hrops" className="gap-1.5 text-xs sm:text-sm">
              HR / Ops
              <Badge variant="secondary" className="ml-1 text-xs">
                {completedOps}/{opsHrUsers.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setters">
            <AcquisitionSettersTab
              setters={acqSetters}
              date={dateStr}
              existingMetrics={existingMetrics}
              currentUserId={user?.id || ""}
              onSaved={refreshMetrics}
              onDuplicate={setDuplicateModal}
            />
          </TabsContent>
          <TabsContent value="aes">
            <AccountExecutivesTab
              aes={aes}
              date={dateStr}
              existingMetrics={existingMetrics}
              currentUserId={user?.id || ""}
              onSaved={refreshMetrics}
              onDuplicate={setDuplicateModal}
            />
          </TabsContent>
          <TabsContent value="sdr">
            <SDRManagerTab
              managers={sdrManagers}
              date={dateStr}
              existingMetrics={existingMetrics}
              currentUserId={user?.id || ""}
              onSaved={refreshMetrics}
              onDuplicate={setDuplicateModal}
            />
          </TabsContent>
          <TabsContent value="hrops">
            <HROpsTab
              users={opsHrUsers}
              date={dateStr}
              existingMetrics={existingMetrics}
              currentUserId={user?.id || ""}
              onSaved={refreshMetrics}
              onDuplicate={setDuplicateModal}
            />
          </TabsContent>
        </Tabs>

        <DuplicateMetricModal
          open={duplicateModal.open}
          userName={duplicateModal.userName}
          date={duplicateModal.date}
          onConfirm={() => {
            duplicateModal.onConfirm();
            setDuplicateModal((p) => ({ ...p, open: false }));
          }}
          onCancel={() => setDuplicateModal((p) => ({ ...p, open: false }))}
        />
      </PageContainer>
    </DashboardLayout>
  );
};

export default OpsAssistantMetricsInput;
