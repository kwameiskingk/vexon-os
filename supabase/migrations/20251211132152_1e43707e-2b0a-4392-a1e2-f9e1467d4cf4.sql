-- Create workspace enum for the new workspace system
CREATE TYPE public.workspace_type AS ENUM ('setters', 'closers', 'ops', 'admin', 'dev');

-- Add missing Setter metrics to daily_metrics
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS total_dials INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS total_talk_time_minutes INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS connects INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS connect_rate NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS connects_over_3min INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS meetings_booked INTEGER DEFAULT 0;

-- Add Closer (AE) metrics to daily_metrics
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS meetings_scheduled INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS demos_scheduled INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS pitch_calls_scheduled INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS pitch_showup_rate NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS proposals_sent INTEGER DEFAULT 0;
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS clients_won INTEGER DEFAULT 0;

-- Add workspace column to daily_metrics
ALTER TABLE public.daily_metrics ADD COLUMN IF NOT EXISTS workspace workspace_type;

-- Rename setter_id to user_id for consistency (if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_metrics' AND column_name = 'setter_id') THEN
    ALTER TABLE public.daily_metrics RENAME COLUMN setter_id TO user_id;
  END IF;
END $$;

-- Add workspace column to user_roles for workspace assignment
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assigned_workspace workspace_type;

-- Update existing setters to have workspace assignment
UPDATE public.user_roles 
SET assigned_workspace = 'setters'::workspace_type 
WHERE role = 'setter' AND assigned_workspace IS NULL;

-- Update existing account_executives to have workspace assignment  
UPDATE public.user_roles 
SET assigned_workspace = 'closers'::workspace_type 
WHERE role = 'account_executive' AND assigned_workspace IS NULL;

-- Update admins
UPDATE public.user_roles 
SET assigned_workspace = 'admin'::workspace_type 
WHERE role = 'admin' AND assigned_workspace IS NULL;

-- Update ops
UPDATE public.user_roles 
SET assigned_workspace = 'ops'::workspace_type 
WHERE role = 'ops' AND assigned_workspace IS NULL;

-- Update dev
UPDATE public.user_roles 
SET assigned_workspace = 'dev'::workspace_type 
WHERE role = 'dev' AND assigned_workspace IS NULL;

-- Update finance and csm to admin workspace
UPDATE public.user_roles 
SET assigned_workspace = 'admin'::workspace_type 
WHERE role IN ('finance', 'csm') AND assigned_workspace IS NULL;

-- Create indexes for workspace queries
CREATE INDEX IF NOT EXISTS idx_daily_metrics_workspace ON public.daily_metrics(workspace);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_workspace_date ON public.daily_metrics(workspace, date);
CREATE INDEX IF NOT EXISTS idx_user_roles_workspace ON public.user_roles(assigned_workspace);