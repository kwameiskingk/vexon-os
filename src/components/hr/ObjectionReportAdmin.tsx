import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { BarChart3, Users, TrendingUp } from "lucide-react";

type DateRange = "today" | "this_week" | "this_month" | "last_7_days" | "last_30_days" | "all_time";

interface ObjectionReportAdminProps {
  /** When set, only objections from setters of these department(s) are shown
   *  (SDR-manager mounts — an array unions a dual-department manager's
   *  setters). Admin/HR mounts omit it and stay global. */
  scopeDepartment?: "fulfilment" | "acquisition" | Array<"fulfilment" | "acquisition">;
}

export function ObjectionReportAdmin({ scopeDepartment }: ObjectionReportAdminProps = {}) {
  const scopeDepartments = scopeDepartment
    ? Array.isArray(scopeDepartment)
      ? scopeDepartment
      : [scopeDepartment]
    : null;
  const [dateRange, setDateRange] = useState<DateRange>("this_week");

  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case "today": return { from: format(now, "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
      case "this_week": return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
      case "this_month": return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
      case "last_7_days": return { from: format(subDays(now, 7), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
      case "last_30_days": return { from: format(subDays(now, 30), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
      case "all_time": return { from: "2020-01-01", to: format(now, "yyyy-MM-dd") };
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-objection-reports", dateRange, scopeDepartments?.join(",") ?? "all"],
    queryFn: async () => {
      const { from, to } = getDateFilter();
      const { data: allReports, error } = await supabase
        .from("objection_reports")
        .select("*")
        .gte("report_date", from)
        .lte("report_date", to)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Department scoping: objection_reports has no department column, so
      // resolve the department's setter user_ids and filter client-side.
      let reports = allReports || [];
      if (scopeDepartments) {
        const { data: deptSetters } = await supabase
          .from("setters_profiles")
          .select("user_id")
          .in("department", scopeDepartments)
          .eq("is_test_account", false);
        const deptIds = new Set((deptSetters || []).map((s) => s.user_id).filter(Boolean));
        reports = reports.filter((r) => deptIds.has(r.setter_id));
      }

      // Get setter names
      const setterIds = [...new Set((reports || []).map(r => r.setter_id))];
      let setterMap: Record<string, string> = {};
      if (setterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", setterIds);
        profiles?.forEach(p => { setterMap[p.id] = p.full_name || "Unknown"; });
      }

      return { reports: reports || [], setterMap };
    },
  });

  const reports = data?.reports || [];
  const setterMap = data?.setterMap || {};

  // Aggregate by objection
  const objectionAgg: Record<string, { totalFrequency: number; setters: Record<string, number>; reportCount: number }> = {};
  reports.forEach((r: any) => {
    if (!objectionAgg[r.objection_text]) {
      objectionAgg[r.objection_text] = { totalFrequency: 0, setters: {}, reportCount: 0 };
    }
    objectionAgg[r.objection_text].totalFrequency += r.frequency;
    objectionAgg[r.objection_text].reportCount += 1;
    const name = setterMap[r.setter_id] || "Unknown";
    objectionAgg[r.objection_text].setters[name] = (objectionAgg[r.objection_text].setters[name] || 0) + r.frequency;
  });

  // Sort by total frequency descending
  const ranked = Object.entries(objectionAgg)
    .sort(([, a], [, b]) => b.totalFrequency - a.totalFrequency)
    .map(([objection, data], index) => ({ rank: index + 1, objection, ...data }));

  const totalMentions = ranked.reduce((sum, r) => sum + r.totalFrequency, 0);
  const uniqueSetters = new Set(reports.map((r: any) => r.setter_id)).size;

  return (
    <div className="p-6 space-y-5">
      {/* Header with filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            <span><strong className="text-foreground">{totalMentions}</strong> total mentions</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span><strong className="text-foreground">{ranked.length}</strong> unique objections</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span><strong className="text-foreground">{uniqueSetters}</strong> setters reporting</span>
          </div>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_7_days">Last 7 Days</SelectItem>
            <SelectItem value="last_30_days">Last 30 Days</SelectItem>
            <SelectItem value="all_time">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : ranked.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No objection reports for this period</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Rank</TableHead>
                <TableHead>Objection</TableHead>
                <TableHead className="w-32 text-center">Times Mentioned</TableHead>
                <TableHead>Setters Affected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((row) => (
                <TableRow key={row.objection}>
                  <TableCell>
                    <Badge
                      variant={row.rank <= 3 ? "default" : "outline"}
                      className={row.rank === 1 ? "bg-amber-500 text-white hover:bg-amber-600" : row.rank === 2 ? "bg-slate-400 text-white hover:bg-slate-500" : row.rank === 3 ? "bg-amber-700 text-white hover:bg-amber-800" : ""}
                    >
                      #{row.rank}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-xs">
                    {row.objection}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-lg font-bold">{row.totalFrequency}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(row.setters).map(([name, count]) => (
                        <Badge key={name} variant="secondary" className="text-xs">
                          {name} ({count})
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
