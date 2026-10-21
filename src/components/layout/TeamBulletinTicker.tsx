import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export function TeamBulletinTicker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: department } = useQuery({
    queryKey: ["setter-bulletin-department", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("setters_profiles")
        .select("department")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      return data?.department || null;
    },
    enabled: !!user?.id,
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["setter-team-bulletins", department, today],
    queryFn: async () => {
      if (!department) return [];
      const { data } = await supabase
        .from("team_bulletins")
        .select("id, title, message")
        .eq("department", department)
        .eq("active", true)
        .lte("starts_on", today)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!department,
  });

  useEffect(() => {
    const channel = supabase
      .channel("setter-team-bulletins")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bulletins" }, () => {
        queryClient.invalidateQueries({ queryKey: ["setter-team-bulletins"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (!bulletins.length) return null;

  const message = bulletins.map((b) => `${b.title}: ${b.message}`).join("   •   ");

  return (
    <div className="relative border-b border-primary/15 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background/60 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background/60 to-transparent z-10" />
      <div className="flex items-center h-7">
        <div className="h-full pl-3 pr-2.5 flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary z-20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <Megaphone className="h-3 w-3" />
          Team Focus
          <span className="mx-1 h-3 w-px bg-primary/30" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          <div className="team-bulletin-marquee text-[12.5px] font-medium text-foreground/80 tracking-wide">
            <span>{message}</span>
            <span aria-hidden="true">{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
