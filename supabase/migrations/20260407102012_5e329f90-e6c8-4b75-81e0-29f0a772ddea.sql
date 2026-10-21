-- Add assigned_ae_id column to meetings table
ALTER TABLE public.meetings 
ADD COLUMN assigned_ae_id UUID REFERENCES public.profiles(id);

-- Add an index for efficient lookups
CREATE INDEX idx_meetings_assigned_ae_id ON public.meetings(assigned_ae_id);
