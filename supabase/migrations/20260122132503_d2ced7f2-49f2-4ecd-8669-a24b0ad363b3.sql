-- Phase 1: Add new roles to app_role enum ONLY
-- These need to be committed before they can be used in functions
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'accounting';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hr';