-- Trial day client names (16 Oct 2026, the owner).
--
-- A trialist never sees a real client name. Each client gets a trial name,
-- "B Recruitment" for Northgate Recruitment and so on: the first letter of the company
-- plus "Recruitment"; when that letter is taken, the first letters of the
-- first two words (Ridgeway Legal = LJ next to Harlow & Finch = L). Elena can
-- rename any of them on the candidate's Trial day card.
--
--   1. client_profiles.trial_alias, unique (case-insensitive), seeded with
--      the owner's names for today's clients; new clients get one on insert.
--   2. trial_assignable_clients() returns the trial name and leaves out test
--      accounts (Meridian Sales Partners).
--   3. trial_active_clients() labels with the trial name instead of
--      "Client A/B" and leaves out test accounts.
--   4. set_trial_alias(): rename, for the same people who assign clients.
--   5. The trial-day briefing gets the owner's new wording, only where it still
--      holds the old default.
--
-- Safe to run twice.

ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS trial_alias text;
CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_trial_alias_unique
  ON public.client_profiles (lower(trial_alias)) WHERE trial_alias IS NOT NULL;

-- The default name for a company, skipping names already in use.
CREATE OR REPLACE FUNCTION public.default_trial_alias(_company text, _exclude uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  w text[] := regexp_split_to_array(trim(coalesce(_company, '')), '\s+');
  one text := upper(left(coalesce(w[1], 'X'), 1)) || ' Recruitment';
  two text := upper(left(coalesce(w[1], 'X'), 1)) || upper(left(coalesce(w[2], ''), 1)) || ' Recruitment';
  n int := 2;
  candidate text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.client_profiles WHERE lower(trial_alias) = lower(one) AND id IS DISTINCT FROM _exclude) THEN
    RETURN one;
  END IF;
  IF two <> one AND NOT EXISTS (SELECT 1 FROM public.client_profiles WHERE lower(trial_alias) = lower(two) AND id IS DISTINCT FROM _exclude) THEN
    RETURN two;
  END IF;
  LOOP
    candidate := replace(two, ' Recruitment', '') || n || ' Recruitment';
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.client_profiles WHERE lower(trial_alias) = lower(candidate) AND id IS DISTINCT FROM _exclude);
    n := n + 1;
  END LOOP;
  RETURN candidate;
END $$;

-- the owner's names for today's clients (only where nothing is set yet).
UPDATE public.client_profiles SET trial_alias = v.alias
FROM (VALUES
  ('Northgate Recruitment', 'B Recruitment'),
  ('Atlas Talent', 'C Recruitment'),
  ('Fenwick Search', 'F Recruitment'),
  ('Ridgeway Legal', 'RL Recruitment'),
  ('Harlow & Finch', 'L Recruitment'),
  ('Brightwater Group', 'M Recruitment'),
  ('Westbrook Recruitment', 'W Recruitment')
) AS v(company, alias)
WHERE client_profiles.company_name = v.company
  AND client_profiles.trial_alias IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.client_profiles o WHERE lower(o.trial_alias) = lower(v.alias))
  -- One row per company, even if a twin exists (live row first, then oldest);
  -- any twin gets its own default name in the loop below.
  AND client_profiles.id = (
    SELECT t.id FROM public.client_profiles t
    WHERE t.company_name = v.company
    ORDER BY (t.status = 'active') DESC, t.created_at
    LIMIT 1
  );

-- Everyone else gets the default, one at a time so each sees the last.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, company_name FROM public.client_profiles WHERE trial_alias IS NULL ORDER BY created_at LOOP
    UPDATE public.client_profiles SET trial_alias = public.default_trial_alias(r.company_name, r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- New clients get theirs on the way in.
CREATE OR REPLACE FUNCTION public.set_default_trial_alias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.trial_alias IS NULL OR trim(NEW.trial_alias) = '' THEN
    NEW.trial_alias := public.default_trial_alias(NEW.company_name, NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_profiles_trial_alias ON public.client_profiles;
CREATE TRIGGER trg_client_profiles_trial_alias
  BEFORE INSERT ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_default_trial_alias();

-- Staff side: real name and trial name, test accounts left out.
DROP FUNCTION IF EXISTS public.trial_assignable_clients();
CREATE FUNCTION public.trial_assignable_clients()
RETURNS TABLE(id uuid, company_name text, trial_alias text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cp.id, cp.company_name, cp.trial_alias
  FROM public.client_profiles cp
  WHERE cp.status = 'active'
    AND coalesce(cp.is_test_account, false) = false
    AND (
      public.has_role(auth.uid(), 'csm'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'dev'::public.app_role)
      OR public.has_role(auth.uid(), 'ops'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
      OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
      OR public.has_capability(auth.uid(), 'can_screen_candidates')
    )
  ORDER BY cp.company_name;
$$;

-- Trialist side: the trial name only, never the real one.
CREATE OR REPLACE FUNCTION public.trial_active_clients()
RETURNS TABLE(id uuid, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT c.trial_client_ids
    FROM public.candidates c
    WHERE c.trialist_user_id = auth.uid()
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1
  ),
  picked AS (
    SELECT cp.id, cp.trial_alias, cp.company_name, ord.n
    FROM me, unnest(me.trial_client_ids) WITH ORDINALITY AS ord(cid, n)
    JOIN public.client_profiles cp ON cp.id = ord.cid
    WHERE cp.status = 'active' AND coalesce(cp.is_test_account, false) = false
  ),
  fallback AS (
    SELECT cp.id, cp.trial_alias, cp.company_name, row_number() OVER (ORDER BY cp.trial_alias) AS n
    FROM public.client_profiles cp
    WHERE cp.status = 'active' AND coalesce(cp.is_test_account, false) = false
      AND NOT EXISTS (SELECT 1 FROM picked)
  ),
  ordered AS (
    SELECT id, trial_alias, company_name, n FROM picked
    UNION ALL
    SELECT id, trial_alias, company_name, n FROM fallback
  )
  SELECT o.id, coalesce(o.trial_alias, public.default_trial_alias(o.company_name, o.id)) AS label
  FROM ordered o
  WHERE auth.uid() IS NOT NULL
  ORDER BY o.n;
$$;

-- Rename (Elena, 16 Oct): same people who assign clients to a trialist.
CREATE OR REPLACE FUNCTION public.set_trial_alias(_client_id uuid, _alias text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v text := regexp_replace(trim(coalesce(_alias, '')), '\s+', ' ', 'g');
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
    OR public.has_capability(auth.uid(), 'can_screen_candidates')
  ) THEN
    RAISE EXCEPTION 'Not allowed to rename trial clients';
  END IF;
  IF length(v) < 2 OR length(v) > 40 THEN
    RAISE EXCEPTION 'The trial name must be 2 to 40 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_profiles WHERE lower(trial_alias) = lower(v) AND id <> _client_id) THEN
    RAISE EXCEPTION 'Another client already shows as %', v;
  END IF;
  -- Never let the trial name give the real one away.
  IF EXISTS (SELECT 1 FROM public.client_profiles WHERE id = _client_id AND lower(v) LIKE '%' || lower(company_name) || '%') THEN
    RAISE EXCEPTION 'The trial name cannot contain the client''s real name';
  END IF;
  UPDATE public.client_profiles SET trial_alias = v WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.set_trial_alias(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_trial_alias(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trial_assignable_clients() TO authenticated;

-- the owner's briefing wording, only where the old default is still there.
UPDATE public.trial_day_settings
SET intro_title = 'How today''s trial day goes',
    intro_body = E'1. By now you will have your trial pack from Elena, and a walkthrough of Close, our CRM.\n\n2. On this platform you will be logging meeting-ready leads on behalf of the client you are representing.\n\n3. Whether the prospect wants a video call or a callback, get more than one time that works for them, so the meeting can be booked with the client.'
WHERE intro_body LIKE '1. Dial the list your team lead gave you in Close.%';

-- Proof: every live client named, Meridian Sales Partners out of the list.
SELECT company_name, trial_alias, is_test_account FROM public.client_profiles WHERE status = 'active' ORDER BY company_name;
