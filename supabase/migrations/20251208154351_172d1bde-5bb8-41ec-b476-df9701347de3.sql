-- Add new role values to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dev';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ops';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'csm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'account_executive';