UPDATE public.employee_onboarding
  SET candidate_id = NULL
  WHERE candidate_id IS NOT NULL
    AND candidate_id NOT IN (SELECT id FROM public.candidates);

ALTER TABLE public.employee_onboarding
  DROP CONSTRAINT IF EXISTS employee_onboarding_candidate_id_fkey;

ALTER TABLE public.employee_onboarding
  ADD CONSTRAINT employee_onboarding_candidate_id_fkey
    FOREIGN KEY (candidate_id)
    REFERENCES public.candidates(id)
    ON DELETE CASCADE;