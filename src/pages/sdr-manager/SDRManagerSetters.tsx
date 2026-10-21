import { useState } from "react";
import { getTitleLabel } from "@/lib/setterTitles";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import SetterRoster from "@/components/sdr-manager/SetterRoster";

const SDRManagerSetters = () => {
  const { user } = useAuth();
  // The client-calendar roster is a fulfilment concept (setters assigned to
  // client campaigns) — acquisition setters aren't assigned to clients. Shown
  // whenever the manager HOLDS fulfilment, so a dual manager keeps the tab.
  const { departments: managerDepartments } = useSdrManagerScope();
  const showRosterTab = managerDepartments.includes("fulfilment");
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  // Active (default, today's behaviour) | Former (leavers with history) | All
  const [rosterFilter, setRosterFilter] = useState<string>("active");

  const { data: setters, isLoading } = useQuery({
    queryKey: ["sdr-manager-setters-list", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Managed roster (assignments, or whole-department for acting admins)
      // wrapped back into the assignment shape so the code below is unchanged.
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      const { data: managedProfiles, error } = managedIds.length
        ? await supabase
            .from("setters_profiles")
            .select(
              "id, user_id, full_name, email, status, department, title, current_coaching_focus, last_coaching_session, created_at, start_date, active, is_test_account",
            )
            .in("id", managedIds)
        : { data: [], error: null };

      if (error) throw error;
      const assignmentsRaw = (managedProfiles ?? []).map((p: any) => ({
        setter_profile_id: p.id,
        department: p.department,
        setters_profiles: p,
      }));

      // Former setters stay in the list data (profile visibility is not
      // active-gated for managers) — the Active/Former roster filter below
      // decides what renders, defaulting to Active only.
      const filteredAssignments = assignmentsRaw.filter((a) => {
        const profile = a.setters_profiles as any;
        // profile can be null when RLS hides the joined row — drop those.
        return !!profile && !profile.is_test_account;
      });

      // Fetch profiles for avatar URLs
      const userIds = filteredAssignments
        .map((a) => (a.setters_profiles as any)?.user_id)
        .filter(Boolean);

      const avatarMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, avatar_url")
          .in("id", userIds);
        (profs || []).forEach((p: any) => {
          if (p.avatar_url) avatarMap.set(p.id, p.avatar_url);
        });
      }

      return filteredAssignments.map((a) => {
        const profile = a.setters_profiles as any;
        const start = profile?.start_date || profile?.created_at;
        const tenure = start ? differenceInDays(new Date(), new Date(start)) : 0;
        return {
          id: profile?.id,
          user_id: profile?.user_id,
          full_name: profile?.full_name,
          email: profile?.email,
          status: profile?.status || "active",
          department: a.department || profile?.department,
          title: profile?.title || "sdr",
          last_coaching_session: profile?.last_coaching_session,
          start_date: start,
          tenure,
          active: profile?.active ?? true,
          avatar_url: profile?.user_id ? avatarMap.get(profile.user_id) : null,
        };
      });
    },
    enabled: !!user?.id,
  });

  const filteredSetters = (setters || []).filter((s) => {
    const matchesSearch =
      s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    const matchesDepartment = departmentFilter === "all" || s.department === departmentFilter;
    const matchesRoster =
      rosterFilter === "all" || (rosterFilter === "active" ? s.active : !s.active);
    return matchesSearch && matchesStatus && matchesDepartment && matchesRoster;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Pill variant="ok">Active</Pill>;
      case "trainee":
        return <Pill variant="info">Trainee</Pill>;
      case "pip":
        return <Pill variant="bad">PIP</Pill>;
      default:
        return <Pill>{status}</Pill>;
    }
  };

  const getDepartmentBadge = (dept: string) => {
    const labels: Record<string, string> = {
      fulfilment: "Fulfilment",
      acquisition: "Sales",
    };
    return <Pill>{labels[dept] || dept || "—"}</Pill>;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader title="Setter Management" subtitle="View, manage, and assign your team" />

        <Tabs defaultValue="management" className="space-y-5">
          <TabsList>
            <TabsTrigger value="management">Setter Management</TabsTrigger>
            {showRosterTab && <TabsTrigger value="roster">Setter Assignment</TabsTrigger>}
          </TabsList>

          <TabsContent value="management" className="space-y-5">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
                <Input
                  placeholder="Search by name or email…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trainee">Trainee</SelectItem>
                  <SelectItem value="pip">PIP</SelectItem>
                </SelectContent>
              </Select>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="fulfilment">Fulfilment</SelectItem>
                  <SelectItem value="acquisition">Sales / Acquisition</SelectItem>
                </SelectContent>
              </Select>
              <Select value={rosterFilter} onValueChange={setRosterFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Roster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="former">Former</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            {isLoading ? (
              <p className="py-8 text-center text-[12px] text-[var(--dim)]">Loading setters…</p>
            ) : filteredSetters.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-[var(--dim)]">No setters found.</p>
            ) : (
              <RowList
                columns="minmax(200px,1.4fr) 110px 100px 130px 80px 110px"
                head={["Setter", "Title", "Department", "Status", <span key="t" className="text-right">Tenure</span>, "Last coached"]}
              >
                {filteredSetters.map((s) => (
                  <Row key={s.id} onClick={() => navigate(`/sdr-manager/setters/${s.id}`)}>
                    <RowName lead={<Avatar name={s.full_name || s.email || "Setter"} src={s.avatar_url} size={28} />} primary={s.full_name || "Unnamed"} secondary={s.email} />
                    <div><Pill variant="info">{getTitleLabel(s.title)}</Pill></div>
                    <div>{getDepartmentBadge(s.department)}</div>
                    <div className="flex items-center gap-[5px]">{getStatusBadge(s.status)}{!s.active && <Pill>Former</Pill>}</div>
                    <RowNum>{s.tenure}d</RowNum>
                    <div className="text-[11.5px] text-[var(--dim)]">{s.last_coaching_session ? format(new Date(s.last_coaching_session), "d MMM yyyy") : "—"}</div>
                  </Row>
                ))}
              </RowList>
            )}
          </TabsContent>

          {showRosterTab && (
            <TabsContent value="roster">
              <SetterRoster />
            </TabsContent>
          )}
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerSetters;
