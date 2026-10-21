import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays } from "date-fns";
import {
  calculateTrendPercentage,
  calculateCompositeScore,
  getTrendStatus,
} from "@/lib/trends";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSetterTargets, upsertSetterTargets } from "@/hooks/useSetterTargets";
import type { SetterTitle } from "@/lib/setterTitles";

export function useSetterProfile(setterProfileId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const setterQuery = useQuery({
    queryKey: ["setter-profile-detail", setterProfileId],
    queryFn: async () => {
      if (!setterProfileId) return null;

      const { data: profile, error } = await supabase
        .from("setters_profiles")
        .select("*")
        .eq("id", setterProfileId)
        .single();
      if (error) throw error;

      // Targets live in setter_targets (legacy columns are deprecated);
      // merged under the same field names so consumers keep working.
      const targets = await fetchSetterTargets(setterProfileId);

      // Get user profile for timezone + avatar
      let userProfile: any = null;
      if (profile.user_id) {
        const { data } = await supabase
          .from("profiles")
          .select("id, avatar_url, timezone, phone")
          .eq("id", profile.user_id)
          .maybeSingle();
        userProfile = data;
      }

      const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");

      const { data: currentPerf } = await supabase
        .from("performance")
        .select("date, meetings_booked, dials_made, talk_time")
        .eq("email", profile.email)
        .gte("date", sevenDaysAgo);

      const { data: previousPerf } = await supabase
        .from("performance")
        .select("meetings_booked, dials_made, talk_time")
        .eq("email", profile.email)
        .gte("date", fourteenDaysAgo)
        .lt("date", sevenDaysAgo);

      const sum = (rows: any[] | null | undefined) =>
        (rows ?? []).reduce(
          (acc, p) => ({
            meetings: acc.meetings + (p.meetings_booked || 0),
            dials: acc.dials + (p.dials_made || 0),
            talk_time: acc.talk_time + (p.talk_time || 0),
          }),
          { meetings: 0, dials: 0, talk_time: 0 },
        );
      const currentTotals = sum(currentPerf);
      const previousTotals = sum(previousPerf);

      const meetingTrend = calculateTrendPercentage(currentTotals.meetings, previousTotals.meetings);
      const dialsTrend = calculateTrendPercentage(currentTotals.dials, previousTotals.dials);
      const talkTimeTrend = calculateTrendPercentage(currentTotals.talk_time, previousTotals.talk_time);
      const compositeScore = calculateCompositeScore(meetingTrend, dialsTrend, talkTimeTrend);
      const trendStatus = getTrendStatus(compositeScore);

      const tenure = profile.created_at
        ? differenceInDays(new Date(), new Date(profile.created_at))
        : 0;

      return {
        ...profile,
        ...targets,
        userProfile,
        currentPerf: currentTotals,
        previousPerf: previousTotals,
        dailyHistory: currentPerf || [],
        meetingTrend,
        dialsTrend,
        talkTimeTrend,
        compositeScore,
        trendStatus,
        tenure,
      };
    },
    enabled: !!setterProfileId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["setter-profile-detail", setterProfileId] });
    queryClient.invalidateQueries({ queryKey: ["sdr-manager-setters-list"] });
    queryClient.invalidateQueries({ queryKey: ["setter-targets", setterProfileId] });
  };

  const updateStatus = useMutation({
    mutationFn: async (newStatus: "active" | "trainee" | "pip") => {
      const { error } = await supabase
        .from("setters_profiles")
        .update({
          status: newStatus,
          status_changed_at: new Date().toISOString(),
          status_changed_by: user?.id,
        })
        .eq("id", setterProfileId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: () => toast.error("Failed to update status"),
  });

  const updateTitle = useMutation({
    mutationFn: async (newTitle: SetterTitle) => {
      const { error } = await supabase
        .from("setters_profiles")
        .update({ title: newTitle } as any)
        .eq("id", setterProfileId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Title updated");
      invalidate();
    },
    onError: () => toast.error("Failed to update title"),
  });

  const updateCoachingFocus = useMutation({
    mutationFn: async (focus: string) => {
      const { error } = await supabase
        .from("setters_profiles")
        .update({ current_coaching_focus: focus || null })
        .eq("id", setterProfileId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coaching focus updated");
      invalidate();
    },
    onError: () => toast.error("Failed to update coaching focus"),
  });

  const updateTargets = useMutation({
    mutationFn: async (targets: {
      daily_dials_target: number;
      daily_meetings_target: number;
      daily_talk_time_target: number;
      weekly_meetings_target: number;
      per_meeting_bonus?: number;
    }) => {
      const { per_meeting_bonus, ...targetValues } = targets;
      await upsertSetterTargets(setterProfileId!, targetValues, user?.id);
      if (per_meeting_bonus !== undefined) {
        const { error } = await supabase
          .from("setters_profiles")
          .update({ per_meeting_bonus })
          .eq("id", setterProfileId!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Targets updated");
      invalidate();
    },
    onError: () => toast.error("Failed to update targets"),
  });

  const updateNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase
        .from("setters_profiles")
        .update({ notes })
        .eq("id", setterProfileId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: () => toast.error("Failed to save notes"),
  });

  return {
    setter: setterQuery.data,
    isLoading: setterQuery.isLoading,
    refetch: setterQuery.refetch,
    updateStatus,
    updateTitle,
    updateCoachingFocus,
    updateTargets,
    updateNotes,
  };
}
