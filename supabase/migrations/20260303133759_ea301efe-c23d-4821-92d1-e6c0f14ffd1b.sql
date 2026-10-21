
ALTER TABLE public.candidates DROP CONSTRAINT candidates_status_check;

ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check 
CHECK (status = ANY (ARRAY['pending', 'passed', 'failed', 'invited_to_interview', 'in_onboarding', 'hired']));
