-- Add updated_at column to agreement_send_queue
ALTER TABLE public.agreement_send_queue 
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();