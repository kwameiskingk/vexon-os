import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MeetingScore } from '@/lib/meetingScores';

/** Fetch scores for a given list of appointment IDs, returns a map keyed by appointment_id. */
export const useMeetingScoresByAppointments = (appointmentIds: string[]) => {
  return useQuery({
    queryKey: ['meeting-scores', 'by-appointments', [...appointmentIds].sort().join(',')],
    enabled: appointmentIds.length > 0,
    queryFn: async (): Promise<Record<string, MeetingScore>> => {
      const { data, error } = await supabase
        .from('meeting_scores')
        .select('*')
        .in('appointment_id', appointmentIds);
      if (error) throw error;
      const map: Record<string, MeetingScore> = {};
      (data || []).forEach((s: any) => {
        if (s.appointment_id) map[s.appointment_id] = s as MeetingScore;
      });
      return map;
    },
  });
};

/** All scores for the current setter (uses RLS — auto-filtered to their meetings). */
export const useSetterMeetingScores = (setterUserId: string | undefined) => {
  return useQuery({
    queryKey: ['meeting-scores', 'setter', setterUserId],
    enabled: !!setterUserId,
    queryFn: async (): Promise<MeetingScore[]> => {
      const { data, error } = await supabase
        .from('meeting_scores')
        .select('*')
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return (data || []) as MeetingScore[];
    },
  });
};

/** Aggregate quality stats for a client. */
export const useClientQualityStats = (clientProfileId: string | undefined) => {
  return useQuery({
    queryKey: ['meeting-scores', 'client-stats', clientProfileId],
    enabled: !!clientProfileId,
    queryFn: async () => {
      // meeting_scores joined via appointment_id → meetings.client_profile_id.
      // Population matches the client-health Avg Quality tile exactly
      // (useNativeClientHealth): fulfilment meetings, matched scores only —
      // the two tiles render side by side and must agree (2026-08-12 ruling).
      const { data: meetings, error: mErr } = await supabase
        .from('meetings')
        .select('id')
        .eq('client_profile_id', clientProfileId)
        .eq('department', 'fulfilment');
      if (mErr) throw mErr;
      const ids = (meetings || []).map((m: any) => m.id);
      if (ids.length === 0) return { avg: 0, qualityCount: 0, total: 0 };
      const { data: scores, error: sErr } = await supabase
        .from('meeting_scores')
        .select('overall_quality')
        .eq('matched', true)
        .in('appointment_id', ids);
      if (sErr) throw sErr;
      const arr = (scores || []).map((s: any) => Number(s.overall_quality)).filter(n => !isNaN(n));
      if (arr.length === 0) return { avg: 0, qualityCount: 0, total: 0 };
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const qualityCount = arr.filter(n => n >= 4).length;
      return { avg: Math.round(avg * 100) / 100, qualityCount, total: arr.length };
    },
  });
};

/** Unmatched rows (admin only via RLS). */
export const useUnmatchedMeetingScores = () => {
  return useQuery({
    queryKey: ['meeting-scores', 'unmatched'],
    queryFn: async (): Promise<MeetingScore[]> => {
      const { data, error } = await supabase
        .from('meeting_scores')
        .select('*')
        .eq('matched', false)
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return (data || []) as MeetingScore[];
    },
  });
};
