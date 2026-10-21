import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompliancePeriod = "today" | "week" | "month";

const periodToRange = (period: CompliancePeriod) => {
  const end = new Date();
  const start = new Date();
  if (period === "week") start.setDate(end.getDate() - 6);
  if (period === "month") start.setDate(end.getDate() - 29);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export interface UserCompliance {
  user_id: string;
  full_name: string;
  email: string;
  role: string | null;
  total: number;
  done: number;
  pct: number;
}

export interface RoleCompliance {
  role: string;
  users: number;
  total: number;
  done: number;
  pct: number;
}

export interface ComplianceSummary {
  overall_pct: number;
  total: number;
  done: number;
  user_count: number;
  by_role: RoleCompliance[];
  by_user: UserCompliance[];
}

export const useTaskCompliance = (period: CompliancePeriod = "week") => {
  const { start, end } = periodToRange(period);
  return useQuery<ComplianceSummary>({
    queryKey: ["task-compliance-v2", period],
    queryFn: async () => {
      const { data: instances, error } = await supabase
        .from("task_instances")
        .select("assigned_to_user_id, status")
        .gte("due_date", start)
        .lte("due_date", end)
        .eq("category", "task");
      if (error) throw error;

      const grouped = new Map<string, { total: number; done: number }>();
      (instances || []).forEach((i) => {
        const cur = grouped.get(i.assigned_to_user_id) || { total: 0, done: 0 };
        cur.total += 1;
        if (i.status === "done") cur.done += 1;
        grouped.set(i.assigned_to_user_id, cur);
      });

      const userIds = Array.from(grouped.keys());
      if (userIds.length === 0) {
        return { overall_pct: 0, total: 0, done: 0, user_count: 0, by_role: [], by_user: [] };
      }

      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);

      const roleByUser = new Map<string, string>();
      (roles || []).forEach((r) => {
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      });

      const by_user: UserCompliance[] = userIds.map((uid) => {
        const p = profiles?.find((x) => x.id === uid);
        const g = grouped.get(uid)!;
        return {
          user_id: uid,
          full_name: p?.full_name || p?.email || "Unknown",
          email: p?.email || "",
          role: roleByUser.get(uid) || null,
          total: g.total,
          done: g.done,
          pct: g.total ? Math.round((g.done / g.total) * 100) : 0,
        };
      }).sort((a, b) => b.pct - a.pct);

      const roleAgg = new Map<string, { users: Set<string>; total: number; done: number }>();
      by_user.forEach((u) => {
        const key = u.role || "unassigned";
        const cur = roleAgg.get(key) || { users: new Set(), total: 0, done: 0 };
        cur.users.add(u.user_id);
        cur.total += u.total;
        cur.done += u.done;
        roleAgg.set(key, cur);
      });

      const by_role: RoleCompliance[] = Array.from(roleAgg.entries())
        .map(([role, v]) => ({
          role,
          users: v.users.size,
          total: v.total,
          done: v.done,
          pct: v.total ? Math.round((v.done / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.pct - a.pct);

      const total = by_user.reduce((s, u) => s + u.total, 0);
      const done = by_user.reduce((s, u) => s + u.done, 0);

      return {
        overall_pct: total ? Math.round((done / total) * 100) : 0,
        total,
        done,
        user_count: by_user.length,
        by_role,
        by_user,
      };
    },
  });
};
