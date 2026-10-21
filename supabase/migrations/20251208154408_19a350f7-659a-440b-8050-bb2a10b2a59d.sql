-- Create system_settings table (single row pattern)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text DEFAULT 'Meridian Sales Partners',
  default_timezone text DEFAULT 'Europe/London',
  default_currency text DEFAULT 'GBP',
  branding_logo_url text,
  branding_primary_color text DEFAULT '#3D1F5F',
  email_sender_name text DEFAULT 'Meridian Sales Partners',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default row if empty
INSERT INTO public.system_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only dev role can read/write system_settings
CREATE POLICY "Dev can read system settings"
ON public.system_settings
FOR SELECT
USING (has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Dev can update system settings"
ON public.system_settings
FOR UPDATE
USING (has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'dev'::app_role));

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only dev role can read audit logs
CREATE POLICY "Dev can read audit logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'dev'::app_role));

-- Authenticated users can insert audit logs for their own actions
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create helper function to check if user is dev
CREATE OR REPLACE FUNCTION public.is_dev(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = 'dev'::app_role
  )
$$;

-- Create trigger for updating system_settings updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Create indexes on audit_logs for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);