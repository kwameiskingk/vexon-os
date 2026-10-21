
-- Phase 1a: Add sdr_manager role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sdr_manager';
