-- Trial Day pack (15 Sep 2026, Marcus's "Trial day planning" doc): the
-- portal briefing becomes a list of sections — how the day works, info on
-- Meridian, Close run-through, good calls, script, bad calls and why, how to
-- qualify and log — each with text and an optional link or video. Edited in
-- Dev Centre → Trialist Access. One column; safe to run twice.
ALTER TABLE public.trial_day_settings
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.trial_day_settings
   SET sections = '[
     {"title":"How the trial day works","body":"Morning briefing, then you are on the phones for a real client. End of day: we go through what you logged together.","url":"","url_label":""},
     {"title":"What Meridian does","body":"We book meetings for recruitment agencies with companies that are hiring. You are calling on behalf of one of those agencies today.","url":"","url_label":""},
     {"title":"Using Close","body":"Your call list, dialler and notes live in Close. Every lead you log here starts with the Close link.","url":"","url_label":""},
     {"title":"What a good call sounds like","body":"","url":"","url_label":""},
     {"title":"The script","body":"","url":"","url_label":""},
     {"title":"What a bad call sounds like, and why","body":"","url":"","url_label":""},
     {"title":"How to qualify and log a meeting-ready lead","body":"Hiring now or in the next 3 months, or open to CVs in that window. They have named the job titles. They have given you two or three times this week they could meet. If they want to book straight away, tell them you will call back shortly — the system is not showing the available times right now.","url":"","url_label":""}
   ]'::jsonb
 WHERE id = 1 AND (sections IS NULL OR sections = '[]'::jsonb);

SELECT jsonb_array_length(sections) AS sections_seeded FROM public.trial_day_settings WHERE id = 1;
