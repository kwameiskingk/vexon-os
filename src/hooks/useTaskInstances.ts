import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TaskInstance {
  id: string;
  template_task_id: string | null;
  assignment_id: string | null;
  assigned_to_user_id: string;
  title: string;
  description: string | null;
  category: "task" | "responsibility";
  due_date: string;
  due_at: string | null;
  status: "open" | "done" | "skipped";
  completed_at: string | null;
  auto_completed: boolean;
  link_type: string | null;
  link_slot: number | null;
  priority: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export const useTaskInstances = (date: string = todayISO()) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["task-instances", user?.id, date],
    queryFn: async () => {
      if (!user?.id) return [] as TaskInstance[];
      const { data, error } = await supabase
        .from("task_instances")
        .select("*")
        .eq("assigned_to_user_id", user.id)
        .eq("due_date", date)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as TaskInstance[];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`task-instances-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_instances", filter: `assigned_to_user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["task-instances", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const toggle = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "open" | "done" }) => {
      // Defense in depth: prevent manual completion of hourly update tasks.
      // They must auto-tick via hourly_updates insert trigger.
      const target = (query.data || []).find((t) => t.id === id);
      if (target?.link_type?.startsWith("form_hourly_") && status === "done") {
        throw new Error("Hourly updates can only be completed by submitting the form during the slot window.");
      }
      const { error } = await supabase
        .from("task_instances")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
          auto_completed: false,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-instances", user?.id] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update task"),
  });

  return { ...query, toggle };
};

export const useCreatePersonalTask = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, description, dueAt }: { title: string; description?: string; dueAt?: string | null }) => {
      if (!user?.id) throw new Error("Not authenticated");
      // Insert directly into task_instances (personal one-off)
      const { error } = await supabase.from("task_instances").insert({
        assigned_to_user_id: user.id,
        title,
        description: description || null,
        category: "task",
        due_date: todayISO(),
        due_at: dueAt || null,
        status: "open",
        priority: "normal",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-instances", user?.id] });
      toast.success("Task added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add task"),
  });
};
