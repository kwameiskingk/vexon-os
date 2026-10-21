import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Department = "all" | "acquisition" | "fulfilment";
type SortKey = "setter_name" | "dials" | "talk_time_seconds" | "connects" | "connect_rate" | "connects_3_plus_mins";
type SortDir = "asc" | "desc";

function formatTalkTime(seconds: number): string {
  if (!seconds) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function CallActivityLeaderboard() {
  const [date, setDate] = useState<Date>(new Date());
  const [dept, setDept] = useState<Department>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dials");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const dateStr = format(date, "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["call-activity-leaderboard", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_close_metrics")
        .select("close_user_id, setter_name, department, dials, talk_time_seconds, connects, connect_rate, connects_3_plus_mins, updated_at")
        .eq("date", dateStr);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const sorted = useMemo(() => {
    const filtered = dept === "all" ? rows : rows.filter((r) => (r.department || "").toLowerCase() === dept);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey] ?? (typeof (a as any)[sortKey] === "string" ? "" : 0);
      const bv = (b as any)[sortKey] ?? (typeof (b as any)[sortKey] === "string" ? "" : 0);
      if (typeof av === "string") return av.localeCompare(String(bv)) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, dept, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "setter_name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40 inline ml-1" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 inline ml-1" />
      : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  const headerBtn = (label: string, key: SortKey, align: "left" | "right" = "right") => (
    <button
      onClick={() => toggleSort(key)}
      className={cn(
        "inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
        align === "right" && "ml-auto"
      )}
    >
      {label}<SortIcon k={key} />
    </button>
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Call Activity Leaderboard</h3>
          <p className="text-xs text-muted-foreground">Live from Close · synced every 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={dept} onValueChange={(v) => setDept(v as Department)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-6">All</TabsTrigger>
              <TabsTrigger value="acquisition" className="text-xs h-6">Acquisition</TabsTrigger>
              <TabsTrigger value="fulfilment" className="text-xs h-6">Fulfilment</TabsTrigger>
            </TabsList>
          </Tabs>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {format(date, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No call activity for {format(date, "MMM d, yyyy")} yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{headerBtn("Setter", "setter_name", "left")}</TableHead>
                <TableHead className="text-right">{headerBtn("Dials", "dials")}</TableHead>
                <TableHead className="text-right">{headerBtn("Talk Time", "talk_time_seconds")}</TableHead>
                <TableHead className="text-right">{headerBtn("Connects", "connects")}</TableHead>
                <TableHead className="text-right">{headerBtn("Connect Rate", "connect_rate")}</TableHead>
                <TableHead className="text-right">{headerBtn("3+ Min", "connects_3_plus_mins")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.close_user_id}>
                  <TableCell className="font-medium">
                    {r.setter_name}
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.department}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.dials ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTalkTime(r.talk_time_seconds ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.connects ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.connect_rate ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{r.connects_3_plus_mins ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
