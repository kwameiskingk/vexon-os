import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  category: "task" | "responsibility";
  recurrence: "once" | "daily" | "weekly" | "monthly";
  recurrence_day: number | null;
  target_role: string | null;
  target_department: string | null;
  link_type: string | null;
  due_time: string | null;
  priority: string;
  is_template: boolean;
  active: boolean;
  /**
   * Project the template feeds (Projects tab, migration 20260913150000).
   * Optional: pre-migration the column doesn't exist, so callers must leave
   * it undefined rather than null or the insert fails.
   */
  project_id?: string | null;
}

export interface TaskAssignment {
  id: string;
  template_task_id: string;
  assigned_role: string | null;
  assigned_department: string | null;
  assigned_user_id: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: string;
}

export const useTaskTemplates = () => {
  return useQuery({
    queryKey: ["task-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("is_template", true)
        .order("title");
      if (error) throw error;
      return (data || []) as unknown as TaskTemplate[];
    },
  });
};

export const useTaskAssignments = () => {
  return useQuery({
    queryKey: ["task-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_assignments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TaskAssignment[];
    },
  });
};

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TaskTemplate>) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        title: payload.title!,
        description: payload.description || null,
        category: payload.category || "task",
        recurrence: payload.recurrence || "daily",
        recurrence_day: payload.recurrence_day ?? null,
        target_role: (payload.target_role as any) || null,
        target_department: payload.target_department || null,
        link_type: payload.link_type || "custom",
        due_time: payload.due_time || null,
        priority: payload.priority || "normal",
        is_template: true,
        active: true,
        created_by_user_id: user?.id,
        // Only send the column when the caller set it (post-migration).
        ...(payload.project_id !== undefined ? { project_id: payload.project_id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, payload) => {
      qc.invalidateQueries({ queryKey: ["task-templates"] });
      if (payload.project_id) {
        // The Projects tab lists linked templates; refresh it too.
        qc.invalidateQueries({ queryKey: ["projects-overview"] });
        qc.invalidateQueries({ queryKey: ["project", payload.project_id] });
        qc.invalidateQueries({ queryKey: ["linkable-task-templates"] });
      }
      toast.success("Template created");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create template"),
  });
};

export const useToggleTemplateActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("tasks").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-templates"] }),
  });
};

export const useCreateAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TaskAssignment> & { assigned_user_ids?: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().slice(0, 10);
      const base = {
        template_task_id: payload.template_task_id!,
        start_date: payload.start_date || today,
        end_date: payload.end_date || null,
        active: true,
        created_by: user?.id,
      };

      // Multiple specific users -> one row per user
      if (payload.assigned_user_ids && payload.assigned_user_ids.length > 0) {
        const rows = payload.assigned_user_ids.map((uid) => ({
          ...base,
          assigned_role: null,
          assigned_department: null,
          assigned_user_id: uid,
        }));
        const { error } = await supabase.from("task_assignments").insert(rows as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task_assignments").insert({
          ...base,
          assigned_role: (payload.assigned_role as any) || null,
          assigned_department: payload.assigned_department || null,
          assigned_user_id: payload.assigned_user_id || null,
        } as any);
        if (error) throw error;
      }
      await supabase.rpc("materialize_task_instances" as any, { p_date: today });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-assignments"] });
      qc.invalidateQueries({ queryKey: ["task-instances"] });
      toast.success("Assignment created");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create assignment"),
  });
};

export const useDeleteAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-assignments"] });
      toast.success("Assignment removed");
    },
  });
};
