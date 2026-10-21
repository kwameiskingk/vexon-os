-- First, create a helper function for admin-level roles
CREATE OR REPLACE FUNCTION public.is_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dev', 'ops', 'finance', 'csm', 'account_executive')
  )
$$;

-- Update setters_profiles SELECT policy
DROP POLICY IF EXISTS "Setters can view all setter profiles" ON public.setters_profiles;
CREATE POLICY "Setters and admins can view all setter profiles" 
ON public.setters_profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'setter'::app_role) OR is_admin_role(auth.uid()));

-- Update setters_profiles ALL policy for admin-level roles
DROP POLICY IF EXISTS "Admins can manage all setter profiles" ON public.setters_profiles;
CREATE POLICY "Admin roles can manage all setter profiles" 
ON public.setters_profiles 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Update client_profiles policies
DROP POLICY IF EXISTS "Admins can manage all client profiles" ON public.client_profiles;
CREATE POLICY "Admin roles can manage all client profiles" 
ON public.client_profiles 
FOR ALL 
USING (is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all client profiles" ON public.client_profiles;
CREATE POLICY "Admin roles can view all client profiles" 
ON public.client_profiles 
FOR SELECT 
USING (is_admin_role(auth.uid()));

-- Update performance table policies
DROP POLICY IF EXISTS "Admins can manage all performance" ON public.performance;
CREATE POLICY "Admin roles can manage all performance" 
ON public.performance 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Add SELECT policy for performance if not exists
DROP POLICY IF EXISTS "Users can view performance" ON public.performance;
CREATE POLICY "Admin roles and setters can view performance" 
ON public.performance 
FOR SELECT 
USING (is_admin_role(auth.uid()) OR has_role(auth.uid(), 'setter'::app_role));

-- Update meetings policies
DROP POLICY IF EXISTS "Admins can manage all meetings" ON public.meetings;
CREATE POLICY "Admin roles can manage all meetings" 
ON public.meetings 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Update tasks policies
DROP POLICY IF EXISTS "Admins can manage all tasks" ON public.tasks;
CREATE POLICY "Admin roles can manage all tasks" 
ON public.tasks 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Update notifications policies to allow admin roles to view
DROP POLICY IF EXISTS "Admin roles can view all notifications" ON public.notifications;
CREATE POLICY "Admin roles can view all notifications" 
ON public.notifications 
FOR SELECT 
USING (is_admin_role(auth.uid()));

-- Update leaderboard related tables
DROP POLICY IF EXISTS "Admins can manage leaderboard awards" ON public.leaderboard_awards;
CREATE POLICY "Admin roles can manage leaderboard awards" 
ON public.leaderboard_awards 
FOR ALL 
USING (is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage leaderboard_achievements" ON public.leaderboard_achievements;
CREATE POLICY "Admin roles can manage leaderboard_achievements" 
ON public.leaderboard_achievements 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Add SELECT policy for leaderboard_achievements for everyone
DROP POLICY IF EXISTS "Everyone can view leaderboard_achievements" ON public.leaderboard_achievements;
CREATE POLICY "Everyone can view leaderboard_achievements" 
ON public.leaderboard_achievements 
FOR SELECT 
USING (true);

-- Update recognition_awards
DROP POLICY IF EXISTS "Admins can manage recognition_awards" ON public.recognition_awards;
CREATE POLICY "Admin roles can manage recognition_awards" 
ON public.recognition_awards 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Add SELECT policy for recognition_awards for everyone
DROP POLICY IF EXISTS "Everyone can view recognition_awards" ON public.recognition_awards;
CREATE POLICY "Everyone can view recognition_awards" 
ON public.recognition_awards 
FOR SELECT 
USING (true);

-- Update leaderboard_bonuses
DROP POLICY IF EXISTS "Admins can manage leaderboard_bonuses" ON public.leaderboard_bonuses;
CREATE POLICY "Admin roles can manage leaderboard_bonuses" 
ON public.leaderboard_bonuses 
FOR ALL 
USING (is_admin_role(auth.uid()));

-- Add SELECT policy for leaderboard_bonuses for everyone
DROP POLICY IF EXISTS "Everyone can view leaderboard_bonuses" ON public.leaderboard_bonuses;
CREATE POLICY "Everyone can view leaderboard_bonuses" 
ON public.leaderboard_bonuses 
FOR SELECT 
USING (true);