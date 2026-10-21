-- Phase 1: Fix RLS Policy for EOD Visibility
-- Drop the existing policy that only allows 'admin' role
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.setter_feedback;

-- Create new policy using is_admin_role() which includes dev, ops, etc.
CREATE POLICY "Admin roles can view all feedback" 
ON public.setter_feedback 
FOR SELECT 
TO authenticated 
USING (is_admin_role(auth.uid()) OR auth.uid() = setter_id);

-- Phase 2: Clean up duplicate entries first (keep most recent per setter per day)
DELETE FROM public.setter_feedback 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY setter_id, date 
      ORDER BY created_at DESC
    ) as rn
    FROM public.setter_feedback
  ) t WHERE rn > 1
);

-- Phase 3: Add unique constraint to prevent duplicate submissions
ALTER TABLE public.setter_feedback 
ADD CONSTRAINT unique_setter_feedback_per_day 
UNIQUE (setter_id, date);