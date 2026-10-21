import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, ButtonV2, Chip, HealthLabel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import type { Health } from "@/components/ui-v2";
import { useClientHealth } from "@/hooks/useNativeClientHealth";
import { useClientHealthOverrides, effectiveHealth } from "@/hooks/useClientHealthOverrides";
import { Search } from "lucide-react";
import { AddFullClientDialog } from "@/components/csm/AddFullClientDialog";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { fetchTestSetterIds, isTestSetterMeeting } from "@/lib/testAccounts";

/**
 * CSM-native client list. Same source of truth as the admin Clients page
 * (client_profiles + meetings), but presented for the CSM workflow: health
 * comes from the client-health snapshot + overrides (the same source the
 * rest of the CSM section uses, not the admin page's local 3-signal model),
 * and each client shows their last catch-up. Normal client creation lives in
 * Onboarding (clients arrive here on completion); the Add Client button is
 * the direct-add escape hatch (AddFullClientDialog) for clients onboarded
 * outside the normal flow. Edits happen on the client profile.
 */

interface ClientRow {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  industry: string | null;
  status: string | null;
  logo: string | null;
}

type HealthFilter = "all" | "green" | "amber" | "red" | "unknown";

const HEALTH_META: Record<Exclude<HealthFilter, "all">, { label: string; dot: string; text: string }> = {
  green: { label: "Healthy", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  amber: { label: "Watch", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  red: { label: "At risk", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  unknown: { label: "No data", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

const CSMClients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [meetings7d, setMeetings7d] = useState<Record<string, number>>({});
  const [lastCatchup, setLastCatchup] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [addOpen, setAddOpen] = useState(false);

  const { data: healthSnap } = useClientHealth();
  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: overrides = {} } = useClientHealthOverrides(clientIds);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const since = format(subDays(new Date(), 7), "yyyy-MM-dd");
    const [clientsRes, meetingsRes, catchupsRes] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("id, company_name, contact_name, email, industry, status, logo")
        // Test clients (Dev Center onboarding Test tab) never belong on the
        // real roster; NULL-safe so pre-column rows still show.
        .or("is_test_account.is.null,is_test_account.eq.false")
        .order("company_name"),
      supabase
        .from("meetings")
        .select("client_profile_id, meeting_date, setter_id, setter_profile_id, logged_by_setter_id")
        .gte("meeting_date", since)
        .not("client_profile_id", "is", null),
      supabase
        .from("client_catchups")
        .select("client_profile_id, scheduled_date, status")
        .order("scheduled_date", { ascending: false }),
    ]);
    setClients((clientsRes.data || []) as ClientRow[]);

    // Demo/test setters' meetings never count toward the 7-day column.
    const testIds = await fetchTestSetterIds();
    const counts: Record<string, number> = {};
    (meetingsRes.data || []).forEach((m) => {
      if (isTestSetterMeeting(m, testIds)) return;
      const id = String(m.client_profile_id);
      counts[id] = (counts[id] || 0) + 1;
    });
    setMeetings7d(counts);

    const latest: Record<string, string> = {};
    (catchupsRes.data || []).forEach((c) => {
      const id = String(c.client_profile_id);
      if (!latest[id] && c.scheduled_date) latest[id] = c.scheduled_date;
    });
    setLastCatchup(latest);
    setLoading(false);
  };

  // Health bucket per client: snapshot row (matched by clientProfileId)
  // overlaid with the manual health_override — identical semantics to the
  // Client Health board, so the two tabs never disagree.
  const healthByClient = useMemo(() => {
    const map: Record<string, "green" | "amber" | "red" | null> = {};
    const rows = healthSnap?.rows || [];
    for (const c of clients) {
      const row = rows.find((r) => r.clientProfileId === c.id);
      map[c.id] = effectiveHealth(row?.healthStatus ?? null, overrides[c.id] ?? null);
    }
    return map;
  }, [clients, healthSnap, overrides]);

  const bucketOf = (id: string): Exclude<HealthFilter, "all"> =>
    (healthByClient[id] ?? "unknown") as Exclude<HealthFilter, "all">;

  const filtered = clients.filter((c) => {
    if (statusFilter !== "all" && (c.status || "active") !== statusFilter) return false;
    if (healthFilter !== "all" && bucketOf(c.id) !== healthFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.company_name?.toLowerCase().includes(q) &&
        !(c.contact_name || "").toLowerCase().includes(q) &&
        !(c.email || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const activeClients = clients.filter((c) => (c.status || "active") === "active");
  const summary = {
    green: activeClients.filter((c) => bucketOf(c.id) === "green").length,
    amber: activeClients.filter((c) => bucketOf(c.id) === "amber").length,
    red: activeClients.filter((c) => bucketOf(c.id) === "red").length,
  };

  const statusPill = (status: string | null) => {
    const s = status || "active";
    if (s === "active") return <Pill variant="ok">Active</Pill>;
    // client_profile_status has no "onboarding" value — "pending" is the
    // in-onboarding state.
    if (s === "pending") return <Pill variant="info">Onboarding</Pill>;
    return <Pill className="capitalize">{s}</Pill>;
  };

  const healthOf = (id: string): Health => {
    const b = bucketOf(id);
    return b === "green" ? "ok" : b === "amber" ? "warn" : b === "red" ? "bad" : "none";
  };

  const counts = {
    all: activeClients.length,
    green: summary.green,
    amber: summary.amber,
    red: summary.red,
    unknown: activeClients.filter((c) => bucketOf(c.id) === "unknown").length,
  };
  const chip = (key: HealthFilter, label: string, n: number) => (
    <Chip key={key} selected={healthFilter === key} onClick={() => setHealthFilter((cur) => (cur === key ? "all" : key))}>
      {label} · {n}
    </Chip>
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Clients"
          subtitle={`${activeClients.length} active · health, meetings this week, catch-up recency`}
          actions={<ButtonV2 variant="primary" onClick={() => setAddOpen(true)}>Add client</ButtonV2>}
        />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-[6px]">
            {chip("all", "Active", counts.all)}
            {chip("green", "Healthy", counts.green)}
            {chip("amber", "Watch", counts.amber)}
            {chip("red", "At risk", counts.red)}
            {chip("unknown", "No data", counts.unknown)}
            <span className="mx-2 h-4 w-px bg-[var(--line)]" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">In onboarding</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative ml-auto min-w-[220px] max-w-sm flex-1">
              <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
              <Input
                placeholder="Search company, contact, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-[12px] text-[var(--dim)]">Loading clients…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[var(--dim)]">No clients match the current filters</div>
          ) : (
            <RowList
              columns="minmax(220px,1.6fr) 110px 70px 130px 110px 1fr"
              head={["Client", "Health", <span key="7d" className="pr-4 text-right">7d</span>, "Last catch-up", "Status", "Industry"]}
            >
              {filtered.map((c) => (
                <Row key={c.id} health={healthOf(c.id)} onClick={() => navigate(`/csm/clients/${c.id}`)}>
                  <RowName lead={<Avatar name={c.company_name || "?"} src={c.logo} size={28} />} primary={c.company_name} secondary={c.contact_name ?? undefined} />
                  <HealthLabel health={healthOf(c.id)}>{HEALTH_META[bucketOf(c.id)].label}</HealthLabel>
                  <RowNum>{meetings7d[c.id] || 0}</RowNum>
                  <div className="text-[11.5px] text-[var(--dim)]">
                    {lastCatchup[c.id] ? formatDistanceToNow(new Date(lastCatchup[c.id]), { addSuffix: true }) : "—"}
                  </div>
                  <div>{statusPill(c.status)}</div>
                  <div className="truncate text-[11.5px] text-[var(--dim)]">{c.industry || "—"}</div>
                </Row>
              ))}
            </RowList>
          )}
        </div>
      </PageContainer>
      <AddFullClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => load()} />
    </DashboardLayout>
  );
};

export default CSMClients;
