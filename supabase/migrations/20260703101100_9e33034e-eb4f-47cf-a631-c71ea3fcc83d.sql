
ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS ae_user_id uuid,
  ADD COLUMN IF NOT EXISTS client_profile_id uuid,
  ADD COLUMN IF NOT EXISTS pitch_call_id uuid;

ALTER TABLE public.client_payments ALTER COLUMN client_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS client_payments_ae_user_id_idx ON public.client_payments (ae_user_id);
CREATE INDEX IF NOT EXISTS client_payments_payment_date_idx ON public.client_payments (payment_date);
