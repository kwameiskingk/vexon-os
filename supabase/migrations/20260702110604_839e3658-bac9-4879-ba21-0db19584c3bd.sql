
ALTER TABLE public.pitch_calls
  ADD COLUMN IF NOT EXISTS cash_collected_ex_vat numeric;

ALTER TABLE public.sales_discovery_logs
  ADD COLUMN IF NOT EXISTS cash_collected_ex_vat numeric,
  ADD COLUMN IF NOT EXISTS is_pipeline_reengagement boolean NOT NULL DEFAULT false;
