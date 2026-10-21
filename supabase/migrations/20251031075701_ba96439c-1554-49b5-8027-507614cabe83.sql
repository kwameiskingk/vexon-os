-- Add credentials field to client_profiles table (encrypted storage)
ALTER TABLE public.client_profiles
ADD COLUMN credentials_encrypted text;

-- Add flag to track if client has changed default password
ALTER TABLE public.client_profiles
ADD COLUMN password_changed_from_default boolean DEFAULT false;

-- Comment for security
COMMENT ON COLUMN public.client_profiles.credentials_encrypted IS 'Encrypted JSON containing admin-stored credentials (Calendly, Close, Email/Slack logins)';
COMMENT ON COLUMN public.client_profiles.password_changed_from_default IS 'Tracks whether client has changed from default password client123';

-- Create function to verify admin password (security definer)
CREATE OR REPLACE FUNCTION public.verify_admin_password(password_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  is_valid boolean;
BEGIN
  -- Get current user's email
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();
  
  -- Attempt to verify password by checking if credentials match
  -- This uses Supabase's internal auth verification
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND encrypted_password = crypt(password_input, encrypted_password)
  ) INTO is_valid;
  
  RETURN is_valid;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_admin_password(text) TO authenticated;