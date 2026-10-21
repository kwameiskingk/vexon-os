
-- Unique index on lowercased sheet_name to prevent duplicate alias rows
CREATE UNIQUE INDEX IF NOT EXISTS client_name_aliases_sheet_name_lower_unique
  ON public.client_name_aliases (lower(sheet_name));

-- Allow admin/dev/ops/csm to update existing aliases (re-target)
DROP POLICY IF EXISTS "Admin/dev/ops/csm can update aliases" ON public.client_name_aliases;
CREATE POLICY "Admin/dev/ops/csm can update aliases"
  ON public.client_name_aliases
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
  );

-- Seed safe aliases for the two clearly-unambiguous unmatched sheet rows
INSERT INTO public.client_name_aliases (sheet_name, client_profile_id)
VALUES
  ('Cornucopia', 'f18b7b93-0867-4079-8114-5cfe3f5b3aa6'),
  ('TAH',        '3e035e23-8d00-4e73-824c-d9f1e9931dd6')
ON CONFLICT DO NOTHING;
