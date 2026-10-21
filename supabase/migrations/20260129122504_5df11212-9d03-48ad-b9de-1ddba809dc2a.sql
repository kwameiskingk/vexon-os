
-- Phase 1b: Create SDR Manager tables, RLS policies, and functions

-- 1.2 Create sdr_manager_assignments table
CREATE TABLE public.sdr_manager_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES auth.users(id),
    department TEXT CHECK (department IN ('fulfilment', 'acquisition')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (manager_user_id, setter_profile_id)
);

-- 1.3 Add new columns to setters_profiles for manager features
ALTER TABLE public.setters_profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'trainee', 'pip')),
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS current_coaching_focus TEXT,
ADD COLUMN IF NOT EXISTS last_coaching_session DATE;

-- 1.4 Create coaching_sessions table
CREATE TABLE public.coaching_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
    manager_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('onboarding', 'weekly_1to1', 'pip_review', 'call_review')),
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    observations TEXT,
    improvements TEXT,
    roleplay_notes TEXT,
    action_items TEXT[],
    call_recording_link TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5 Create pip_records table
CREATE TABLE public.pip_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
    started_by UUID NOT NULL REFERENCES auth.users(id),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    reason TEXT NOT NULL,
    target_metrics JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'extended')),
    outcome TEXT,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6 Create setter_onboarding_checklist table
CREATE TABLE public.setter_onboarding_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
    manager_user_id UUID REFERENCES auth.users(id),
    onboarding_day INTEGER NOT NULL CHECK (onboarding_day >= 1 AND onboarding_day <= 14),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    listened_to_calls BOOLEAN DEFAULT false,
    script_review_completed BOOLEAN DEFAULT false,
    roleplay_passed BOOLEAN DEFAULT false,
    manager_feedback TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'needs_work')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (setter_profile_id, onboarding_day)
);

-- Create security definer function to check if user is an SDR manager for a setter
CREATE OR REPLACE FUNCTION public.is_sdr_manager_for_setter(_user_id UUID, _setter_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sdr_manager_assignments
        WHERE manager_user_id = _user_id
        AND setter_profile_id = _setter_profile_id
    )
$$;

-- Create function to check if user has SDR manager role
CREATE OR REPLACE FUNCTION public.has_sdr_manager_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
        AND role = 'sdr_manager'
    )
$$;

-- Enable RLS on all new tables
ALTER TABLE public.sdr_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pip_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setter_onboarding_checklist ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sdr_manager_assignments
CREATE POLICY "Admins can manage all assignments"
ON public.sdr_manager_assignments
FOR ALL
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "SDR Managers can view their assignments"
ON public.sdr_manager_assignments
FOR SELECT
USING (manager_user_id = auth.uid());

-- RLS Policies for coaching_sessions
CREATE POLICY "Admins can manage all coaching sessions"
ON public.coaching_sessions
FOR ALL
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "SDR Managers can manage their coaching sessions"
ON public.coaching_sessions
FOR ALL
USING (manager_user_id = auth.uid());

CREATE POLICY "Setters can view their own coaching sessions"
ON public.coaching_sessions
FOR SELECT
USING (
    setter_profile_id IN (
        SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
    )
);

-- RLS Policies for pip_records
CREATE POLICY "Admins can manage all PIP records"
ON public.pip_records
FOR ALL
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "SDR Managers can manage PIPs for assigned setters"
ON public.pip_records
FOR ALL
USING (
    public.is_sdr_manager_for_setter(auth.uid(), setter_profile_id)
    OR started_by = auth.uid()
);

CREATE POLICY "Setters can view their own PIP records"
ON public.pip_records
FOR SELECT
USING (
    setter_profile_id IN (
        SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
    )
);

-- RLS Policies for setter_onboarding_checklist
CREATE POLICY "Admins can manage all onboarding checklists"
ON public.setter_onboarding_checklist
FOR ALL
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "SDR Managers can manage onboarding for assigned setters"
ON public.setter_onboarding_checklist
FOR ALL
USING (
    public.is_sdr_manager_for_setter(auth.uid(), setter_profile_id)
    OR manager_user_id = auth.uid()
);

CREATE POLICY "Setters can view their own onboarding checklist"
ON public.setter_onboarding_checklist
FOR SELECT
USING (
    setter_profile_id IN (
        SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
    )
);

-- Create indexes for performance
CREATE INDEX idx_sdr_manager_assignments_manager ON public.sdr_manager_assignments(manager_user_id);
CREATE INDEX idx_sdr_manager_assignments_setter ON public.sdr_manager_assignments(setter_profile_id);
CREATE INDEX idx_coaching_sessions_setter ON public.coaching_sessions(setter_profile_id);
CREATE INDEX idx_coaching_sessions_manager ON public.coaching_sessions(manager_user_id);
CREATE INDEX idx_coaching_sessions_date ON public.coaching_sessions(session_date);
CREATE INDEX idx_pip_records_setter ON public.pip_records(setter_profile_id);
CREATE INDEX idx_pip_records_status ON public.pip_records(status);
CREATE INDEX idx_setter_onboarding_setter ON public.setter_onboarding_checklist(setter_profile_id);

-- Trigger to update coaching_sessions updated_at
CREATE TRIGGER update_coaching_sessions_updated_at
BEFORE UPDATE ON public.coaching_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update setter_onboarding_checklist updated_at
CREATE TRIGGER update_setter_onboarding_checklist_updated_at
BEFORE UPDATE ON public.setter_onboarding_checklist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update last_coaching_session on setters_profiles
CREATE OR REPLACE FUNCTION public.update_setter_last_coaching()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.setters_profiles
    SET last_coaching_session = NEW.session_date
    WHERE id = NEW.setter_profile_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_setter_last_coaching_trigger
AFTER INSERT ON public.coaching_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_setter_last_coaching();
