
ALTER TABLE public.employee_onboarding DROP CONSTRAINT employee_onboarding_stage_check;

ALTER TABLE public.employee_onboarding ADD CONSTRAINT employee_onboarding_stage_check 
CHECK (stage = ANY (ARRAY[
  'screening', 'interview', 'live_call', 'final_interview', 'offer_letter', 'training', 'account_setup',
  'completed', 'cancelled',
  'offer_accepted', 'contract_sent', 'docs_received', 'accounts_provisioned', 'training_scheduled', 'active'
]));
