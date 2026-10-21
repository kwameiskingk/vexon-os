-- Create table for pending badge proposals (automatic detection)
CREATE TABLE IF NOT EXISTS public.pending_badge_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  criteria_met JSONB,
  proposed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_badge_proposals ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all proposals
CREATE POLICY "Admins can manage pending badges"
ON public.pending_badge_proposals
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_pending_badges_status ON public.pending_badge_proposals(status);
CREATE INDEX idx_pending_badges_email ON public.pending_badge_proposals(email);