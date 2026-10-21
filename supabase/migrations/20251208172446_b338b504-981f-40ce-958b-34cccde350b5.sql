-- Fix SECURITY DEFINER functions with mutable search_path

-- Fix has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Fix is_admin_role function
CREATE OR REPLACE FUNCTION public.is_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dev', 'ops', 'finance', 'csm', 'account_executive')
  )
$$;

-- Fix is_dev function
CREATE OR REPLACE FUNCTION public.is_dev(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = 'dev'::app_role
  )
$$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Fix handle_setter_role_assignment function
CREATE OR REPLACE FUNCTION public.handle_setter_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  user_name text;
BEGIN
  IF NEW.role = 'setter' THEN
    SELECT email, full_name INTO user_email, user_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    INSERT INTO public.setters_profiles (user_id, email, full_name, active, created_at)
    VALUES (NEW.user_id, user_email, user_name, true, now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Fix handle_client_role_assignment function
CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, company_name, status, created_at)
    VALUES (NEW.user_id, 'Unspecified', 'active', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix assign_default_role function
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

-- Fix handle_new_client_user function
CREATE OR REPLACE FUNCTION public.handle_new_client_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'client'
  ) THEN
    INSERT INTO public.client_profiles (user_id, company_name, created_at)
    VALUES (NEW.id, 'Unspecified', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Fix notification trigger functions
CREATE OR REPLACE FUNCTION public.notify_meeting_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
  VALUES (
    'admin',
    'New Meeting Awaiting Approval',
    'Meeting logged by ' || COALESCE((SELECT full_name FROM setters_profiles WHERE user_id = NEW.setter_id), 'setter') || ' awaiting approval.',
    'meeting',
    '/admin/meetings',
    NEW.setter_id
  );
  
  IF NEW.client_profile_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    SELECT 
      'client',
      cp.user_id,
      'New Meeting Available',
      'New meeting available to accept or reject.',
      'meeting',
      '/client/meetings',
      NEW.setter_id
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_meeting_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.client_accepted IS DISTINCT FROM NEW.client_accepted THEN
    IF NEW.client_accepted = true THEN
      INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
      VALUES (
        'admin',
        'Meeting Accepted',
        'Client ' || NEW.company_name || ' accepted meeting.',
        'meeting',
        '/admin/meetings',
        NEW.client_user_id
      );
    ELSIF NEW.client_accepted = false THEN
      INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
      VALUES (
        'admin',
        'Meeting Rejected',
        'Client ' || NEW.company_name || ' rejected meeting.',
        'meeting',
        '/admin/meetings',
        NEW.client_user_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_resource_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url)
  VALUES (
    'admin',
    'New Resource Added',
    'Resource "' || NEW.title || '" has been added.',
    'resource',
    '/admin/resources'
  );
  
  IF NEW.visible_to_clients THEN
    INSERT INTO public.notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'client',
      'New Resource Available',
      'Resource "' || NEW.title || '" is now available.',
      'resource',
      '/client/resources'
    );
  END IF;
  
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url)
  VALUES (
    'setter',
    'New Resource Available',
    'Resource "' || NEW.title || '" is now available.',
    'resource',
    '/setter/resources'
  );
  
  RETURN NEW;
END;
$$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
  invoice_number text;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN invoice_number ~ '^MSP-INV-[0-9]+$' 
      THEN CAST(SUBSTRING(invoice_number FROM 8) AS integer)
      ELSE 0 
    END
  ), 0) + 1 
  INTO next_num 
  FROM public.accounting_records;
  
  invoice_number := 'MSP-INV-' || LPAD(next_num::text, 4, '0');
  RETURN invoice_number;
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix set_next_payment_date function  
CREATE OR REPLACE FUNCTION public.set_next_payment_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.first_payment_date IS NOT NULL AND NEW.next_payment_due IS NULL THEN
    NEW.next_payment_due := NEW.first_payment_date + INTERVAL '1 month';
  END IF;
  RETURN NEW;
END;
$$;

-- Fix verify_admin_password function
CREATE OR REPLACE FUNCTION public.verify_admin_password(password_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN password_input = 'Meridian2025!';
END;
$$;