-- Partnerships Portal — Migration 1 of 2 (applied manually by the owner in the
-- the hosted builder SQL editor on 2026-07-28, before Migration 2; enum values must be
-- committed before anything references them).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
