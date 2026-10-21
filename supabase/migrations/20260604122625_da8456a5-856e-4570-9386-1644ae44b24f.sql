CREATE TABLE public.ceo_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  owner_name text NOT NULL,
  owner_user_id uuid,
  department text NOT NULL DEFAULT 'other',
  description text,
  progress_pct integer NOT NULL DEFAULT 0,
  deadline date,
  status text NOT NULL DEFAULT 'active',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_range CHECK (progress_pct >= 0 AND progress_pct <= 100),
  CONSTRAINT status_values CHECK (status IN ('active', 'paused', 'done')),
  CONSTRAINT department_values CHECK (department IN ('sales', 'ops', 'hr', 'dev', 'other'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ceo_initiatives TO authenticated;
GRANT ALL ON public.ceo_initiatives TO service_role;

ALTER TABLE public.ceo_initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CEO only - select"
  ON public.ceo_initiatives FOR SELECT
  TO authenticated
  USING (auth.uid() = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'::uuid);

CREATE POLICY "CEO only - insert"
  ON public.ceo_initiatives FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'::uuid);

CREATE POLICY "CEO only - update"
  ON public.ceo_initiatives FOR UPDATE
  TO authenticated
  USING (auth.uid() = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'::uuid)
  WITH CHECK (auth.uid() = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'::uuid);

CREATE POLICY "CEO only - delete"
  ON public.ceo_initiatives FOR DELETE
  TO authenticated
  USING (auth.uid() = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'::uuid);

CREATE TRIGGER trg_ceo_initiatives_updated_at
  BEFORE UPDATE ON public.ceo_initiatives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();