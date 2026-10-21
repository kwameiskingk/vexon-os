-- 2 Oct 2026 (Elena): the Employee Hub start date only ever saved to
-- setters_profiles, so staff without a setter row (talent acquisition, finance,
-- admin) saw "Saved" and kept their sign-up date. profiles.start_date holds it
-- for everyone; setters_profiles.start_date still wins for setters.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS start_date date;
