import { useMemo, useState } from "react";
import { useTaskCompliance, CompliancePeriod } from "@/hooks/useTaskCompliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, TrendingUp, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", dev: "Dev", ops: "Operations", csm: "Client Success",
  account_executive: "Account Executive", sdr_manager: "SDR Manager",
  setter: "Setter", hr: "HR", finance: "Finance", accounting: "Accounting",
  gtm_engineer: "GTM Engineer", ops_assistant: "Ops Assistant", unassigned: "Unassigned",
};

const pctColor = (pct: number) =>
  pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-destructive";
const pctBg = (pct: number) =>
  pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive";

export const ComplianceGrid = () => {
  const [period, setPeriod] = useState<CompliancePeriod>("week");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const { data, isLoading } = useTaskCompliance(period);

  const summary = data || { overall_pct: 0, total: 0, done: 0, user_count: 0, by_role: [], by_user: [] };

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return summary.by_user.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
      );
    });
  }, [summary.by_user, search, roleFilter]);

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Compliance</h2>
          <p className="text-xs text-muted-foreground">
            How many assigned tasks are getting done. Click any role or person to drill in.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1">
          {(["today", "week", "month"] as CompliancePeriod[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setPeriod(p)}
            >
              {p === "today" ? "Today" : p === "week" ? "Last 7 days" : "Last 30 days"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}</div>
          <div className="h-64 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      ) : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Overall completion"
              value={`${summary.overall_pct}%`}
              accent={pctColor(summary.overall_pct)}
              progress={summary.overall_pct}
            />
            <SummaryCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Tasks completed"
              value={`${summary.done}`}
              hint={`of ${summary.total} due`}
            />
            <SummaryCard
              icon={<Users className="h-4 w-4" />}
              label="People tracked"
              value={`${summary.user_count}`}
              hint={`across ${summary.by_role.length} role${summary.by_role.length !== 1 ? "s" : ""}`}
            />
          </div>

          {/* By-role chips */}
          {summary.by_role.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card/40 p-4">
              <div className="text-xs font-medium text-muted-foreground mb-3">By role · click to filter</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setRoleFilter(null)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    roleFilter === null ? "bg-primary text-primary-foreground border-primary" : "border-border/50 hover:border-border"
                  )}
                >
                  All
                </button>
                {summary.by_role.map((r) => (
                  <button
                    key={r.role}
                    onClick={() => setRoleFilter(roleFilter === r.role ? null : r.role)}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      roleFilter === r.role ? "bg-primary/10 border-primary text-foreground" : "border-border/50 hover:border-border"
                    )}
                  >
                    <span>{ROLE_LABELS[r.role] || r.role}</span>
                    <span className={cn("font-bold", pctColor(r.pct))}>{r.pct}%</span>
                    <span className="text-muted-foreground">({r.users})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, role…"
                className="pl-8 h-9"
              />
            </div>
            {(roleFilter || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setRoleFilter(null); setSearch(""); }}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Per-user drill-down */}
          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
              No matching users for this period.
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 divide-y divide-border/30 overflow-hidden">
              {filteredUsers.map((u) => (
                <UserRow key={u.user_id} user={u} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SummaryCard = ({
  icon, label, value, hint, accent, progress,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: string; progress?: number;
}) => (
  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
    <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider mb-2">
      {icon}
      <span>{label}</span>
    </div>
    <div className={cn("text-3xl font-bold tabular-nums", accent)}>{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    {typeof progress === "number" && (
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full transition-all duration-700", pctBg(progress))} style={{ width: `${progress}%` }} />
      </div>
    )}
  </div>
);

const UserRow = ({ user }: { user: { user_id: string; full_name: string; email: string; role: string | null; total: number; done: number; pct: number } }) => {
  const [open, setOpen] = useState(false);
  const missed = user.total - user.done;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-3 px-4 hover:bg-muted/20 transition-colors text-left">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {(user.full_name || user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user.full_name}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{user.email}</span>
              {user.role && <Badge variant="outline" className="h-4 text-[9px] px-1.5">{ROLE_LABELS[user.role] || user.role}</Badge>}
            </div>
          </div>
          <div className="hidden md:block w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all duration-500", pctBg(user.pct))} style={{ width: `${user.pct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums w-16 text-right">{user.done}/{user.total}</div>
          <div className={cn("w-12 text-right tabular-nums text-sm font-bold", pctColor(user.pct))}>{user.pct}%</div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-3 pt-1 bg-muted/10 border-t border-border/30 grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</div>
            <div className="text-lg font-bold text-success">{user.done}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Missed</div>
            <div className={cn("text-lg font-bold", missed > 0 ? "text-destructive" : "text-muted-foreground")}>{missed}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total due</div>
            <div className="text-lg font-bold">{user.total}</div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
