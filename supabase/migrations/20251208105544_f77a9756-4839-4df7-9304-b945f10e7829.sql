-- Add new columns to agreement_send_queue for PandaDoc integration
ALTER TABLE public.agreement_send_queue 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
ADD COLUMN IF NOT EXISTS correlation_id uuid,
ADD COLUMN IF NOT EXISTS pandadoc_document_id text,
ADD COLUMN IF NOT EXISTS error_message text;

-- Add company_name column if it doesn't exist (needed for payload)
ALTER TABLE public.agreement_send_queue 
ADD COLUMN IF NOT EXISTS company_name text;