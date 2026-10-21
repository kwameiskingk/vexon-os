-- Create invites table for admin access control
CREATE TABLE public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_code text NOT NULL UNIQUE,
  invited_email text NOT NULL,
  role app_role NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites
CREATE POLICY "Admins can manage invites"
ON public.invites
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow checking valid invites without authentication (for signup page)
CREATE POLICY "Anyone can check valid invites"
ON public.invites
FOR SELECT
USING (expires_at > now() AND used_at IS NULL);

-- Add trigger for updated_at if not exists
CREATE TRIGGER update_invites_updated_at
BEFORE UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();