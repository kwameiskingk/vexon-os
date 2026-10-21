-- Fix meeting_logs access so admin roles can write goals and setters can READ their own goals (read-only)

-- Ensure RLS is enabled
ALTER TABLE public.meeting_logs ENABLE ROW LEVEL SECURITY;

-- Remove legacy / conflicting policies
DROP POLICY IF EXISTS "Admins can manage meeting_logs" ON public.meeting_logs;
DROP POLICY IF EXISTS "Admin roles can manage meeting_logs" ON public.meeting_logs;
DROP POLICY IF EXISTS "Setters can view their own meeting_logs" ON public.meeting_logs;
DROP POLICY IF EXISTS "Setters can insert their own meeting_logs" ON public.meeting_logs;
DROP POLICY IF EXISTS "Setters can update their own meeting_logs" ON public.meeting_logs;

-- Admin-level roles (dev, admin, ops, finance, csm, account_executive) can fully manage meeting logs
CREATE POLICY "Admin roles can manage meeting_logs"
ON public.meeting_logs
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));

-- Setters can only READ their own meeting logs
-- Supports both historical forms:
-- 1) meeting_logs.setter_id = auth.uid()
-- 2) meeting_logs.setter_id = setters_profiles.id (canonical)
CREATE POLICY "Setters can read their own meeting_logs"
ON public.meeting_logs
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  setter_id = auth.uid()
  OR setter_id IN (
    SELECT sp.id
    FROM public.setters_profiles sp
    WHERE sp.user_id = auth.uid()
  )
);

-- Deduplicate meeting_logs so we can enforce one log per (setter_id, date, meeting_type)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY setter_id, date, meeting_type
      ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM public.meeting_logs
)
DELETE FROM public.meeting_logs ml
USING ranked r
WHERE ml.id = r.id
  AND r.rn > 1;

-- Make the (setter_id, date, meeting_type) index UNIQUE so the UI can safely UPSERT
DROP INDEX IF EXISTS public.idx_meeting_logs_setter_date;
CREATE UNIQUE INDEX idx_meeting_logs_setter_date
ON public.meeting_logs (setter_id, date, meeting_type);
