-- Add PandaDoc webhook fields to existing client_onboarding_stages table
ALTER TABLE public.client_onboarding_stages
ADD COLUMN IF NOT EXISTS source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_event text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_key text UNIQUE,
ADD COLUMN IF NOT EXISTS pandadoc_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pandadoc_created_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pandadoc_paid_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pandadoc_shared_link text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS created_by_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS grand_total_amount numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS grand_total_currency text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS drive_folder_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS webhook_payload_raw jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS signer_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS signer_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS company_name_raw text DEFAULT NULL;

-- Create index on source_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_onboarding_stages_source_key 
ON public.client_onboarding_stages(source_key) WHERE source_key IS NOT NULL;

-- Create audit log table for webhook calls
CREATE TABLE IF NOT EXISTS public.onboarding_webhook_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_key text,
  source text,
  event_type text,
  status text NOT NULL, -- 'success', 'error', 'duplicate'
  message text,
  request_payload jsonb,
  response_payload jsonb,
  onboarding_id uuid REFERENCES public.client_onboarding_stages(id) ON DELETE SET NULL
);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_onboarding_webhook_audit_created_at 
ON public.onboarding_webhook_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_webhook_audit_source_key 
ON public.onboarding_webhook_audit_log(source_key);

-- RLS for audit log (admin/dev/ops only)
ALTER TABLE public.onboarding_webhook_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin roles can view webhook audit logs"
ON public.onboarding_webhook_audit_log
FOR SELECT
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Service role can insert audit logs"
ON public.onboarding_webhook_audit_log
FOR INSERT
WITH CHECK (true);