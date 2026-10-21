
-- First make started_by nullable temporarily, clean up, then delete
ALTER TABLE public.pip_records ALTER COLUMN started_by DROP NOT NULL;

UPDATE public.pip_records SET started_by = NULL WHERE started_by = '50fa30ea-62cc-4313-800c-42d4061c858f';
UPDATE public.pip_records SET closed_by = NULL WHERE closed_by = '50fa30ea-62cc-4313-800c-42d4061c858f';

DELETE FROM auth.users WHERE id = '50fa30ea-62cc-4313-800c-42d4061c858f';
