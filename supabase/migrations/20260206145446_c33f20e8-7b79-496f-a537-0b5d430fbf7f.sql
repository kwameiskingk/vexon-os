
-- FIX 1: Restrict profiles table - drop old permissive policy, add scoped one
DROP POLICY IF EXISTS "Team members can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_admin_role(auth.uid()));

-- FIX 2: Create server-side encryption for credentials using pgcrypto
CREATE OR REPLACE FUNCTION public.encrypt_credentials(
  p_client_profile_id uuid,
  p_credentials_json text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key text;
BEGIN
  v_encryption_key := encode(digest(p_client_profile_id::text || current_setting('app.settings.jwt_secret', true), 'sha256'), 'hex');
  
  UPDATE public.client_profiles
  SET credentials_encrypted = encode(
    pgp_sym_encrypt(p_credentials_json, v_encryption_key),
    'base64'
  ),
  updated_at = now()
  WHERE id = p_client_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_credentials(
  p_client_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key text;
  v_encrypted text;
  v_result text;
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT credentials_encrypted INTO v_encrypted
  FROM public.client_profiles
  WHERE id = p_client_profile_id;

  IF v_encrypted IS NULL OR v_encrypted = '' THEN
    RETURN '[]';
  END IF;

  v_encryption_key := encode(digest(p_client_profile_id::text || current_setting('app.settings.jwt_secret', true), 'sha256'), 'hex');
  
  BEGIN
    v_result := pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_encryption_key);
  EXCEPTION WHEN OTHERS THEN
    v_result := v_encrypted;
  END;
  
  RETURN v_result;
END;
$$;
