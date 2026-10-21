
UPDATE public.performance
SET talk_time = ROUND(call_duration_seconds::numeric / 60)::int,
    updated_at = now()
WHERE date >= '2026-05-01'
  AND COALESCE(call_duration_seconds, 0) > 0
  AND COALESCE(talk_time, 0) = 0;
