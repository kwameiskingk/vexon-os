
-- Phase 1: Add new columns to coaching_sessions
ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS custom_session_label text,
  ADD COLUMN IF NOT EXISTS agenda text,
  ADD COLUMN IF NOT EXISTS setter_self_reflection text,
  ADD COLUMN IF NOT EXISTS overall_rating smallint,
  ADD COLUMN IF NOT EXISTS scorecard jsonb,
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid;

-- Phase 1: Create coaching_action_items table
CREATE TABLE public.coaching_action_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coaching_session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  setter_profile_id uuid NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL,
  description text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  carried_to_session_id uuid REFERENCES public.coaching_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coaching_action_items ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/dev/ops can do everything
CREATE POLICY "Admin roles can manage all coaching action items"
ON public.coaching_action_items FOR ALL
TO authenticated
USING (is_admin_role(auth.uid()));

-- RLS: SDR managers can manage items for their assigned setters
CREATE POLICY "SDR managers can manage action items for assigned setters"
ON public.coaching_action_items FOR ALL
TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND is_sdr_manager_for_setter(auth.uid(), setter_profile_id)
);

-- RLS: Setters can view their own action items
CREATE POLICY "Setters can view own action items"
ON public.coaching_action_items FOR SELECT
TO authenticated
USING (
  setter_profile_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
);

-- RLS: Setters can update their own action items (mark as completed)
CREATE POLICY "Setters can update own action items"
ON public.coaching_action_items FOR UPDATE
TO authenticated
USING (
  setter_profile_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  setter_profile_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_coaching_action_items_updated_at
BEFORE UPDATE ON public.coaching_action_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_coaching_action_items_setter ON public.coaching_action_items(setter_profile_id);
CREATE INDEX idx_coaching_action_items_session ON public.coaching_action_items(coaching_session_id);
CREATE INDEX idx_coaching_action_items_status ON public.coaching_action_items(status);
CREATE INDEX idx_coaching_sessions_recurring ON public.coaching_sessions(recurring_group_id) WHERE recurring_group_id IS NOT NULL;
