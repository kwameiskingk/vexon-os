-- Create campaign_milestones table for tracking timeline events
CREATE TABLE public.campaign_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('meeting_booked', 'meeting_sat', 'terms_sent', 'vacancy', 'fee_value', 'custom')),
  title TEXT NOT NULL,
  description TEXT,
  milestone_date DATE NOT NULL,
  value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.campaign_milestones ENABLE ROW LEVEL SECURITY;

-- Policy: Clients can view milestones for their own client profile
CREATE POLICY "Clients can view their own milestones"
ON public.campaign_milestones
FOR SELECT
USING (
  client_profile_id IN (
    SELECT client_profile_id FROM public.client_profile_users WHERE user_id = auth.uid()
  )
  OR
  client_profile_id IN (
    SELECT id FROM public.client_profiles WHERE user_id = auth.uid()
  )
);

-- Policy: Admin roles can manage all milestones
CREATE POLICY "Admins can manage all milestones"
ON public.campaign_milestones
FOR ALL
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_campaign_milestones_client ON public.campaign_milestones(client_profile_id);
CREATE INDEX idx_campaign_milestones_campaign ON public.campaign_milestones(campaign_id);

-- Create trigger for updated_at
CREATE TRIGGER update_campaign_milestones_updated_at
BEFORE UPDATE ON public.campaign_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();