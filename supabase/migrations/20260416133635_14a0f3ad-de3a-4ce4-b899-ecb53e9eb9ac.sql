-- Add ops_assistant to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ops_assistant';