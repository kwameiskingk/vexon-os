-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'setter', 'client');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_roles table (CRITICAL: roles stored separately for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_website TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  industry TEXT,
  company_size TEXT,
  country TEXT,
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'low', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create meetings table
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  setter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_website TEXT,
  prospect_name TEXT NOT NULL,
  prospect_email TEXT NOT NULL,
  prospect_mobile TEXT,
  prospect_linkedin TEXT,
  meeting_date DATE NOT NULL,
  meeting_time TIME NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'accepted', 'rejected', 'sat')),
  approved_by_admin BOOLEAN DEFAULT FALSE,
  accepted_by_client BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create performance table
CREATE TABLE public.performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  dials_made INTEGER DEFAULT 0,
  dials_target INTEGER DEFAULT 1000,
  conversations INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  meetings_target INTEGER DEFAULT 70,
  sat_meetings INTEGER DEFAULT 0,
  warm_leads INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(setter_id, date)
);

-- Create leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_website TEXT,
  contact_name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  linkedin_url TEXT,
  callback_date DATE,
  callback_time TIME,
  source TEXT CHECK (source IN ('cold_call', 'cold_email', 'other')),
  industry TEXT,
  assigned_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create resources table
CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('video', 'template', 'testimonial', 'process')),
  description TEXT,
  url TEXT NOT NULL,
  visible_to_clients BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
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

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for clients
CREATE POLICY "Admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their own data"
  ON public.clients FOR SELECT
  USING (
    public.has_role(auth.uid(), 'client') AND
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- RLS Policies for campaigns
CREATE POLICY "Admins can manage all campaigns"
  ON public.campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for meetings
CREATE POLICY "Admins can manage all meetings"
  ON public.meetings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters can view their own meetings"
  ON public.meetings FOR SELECT
  USING (auth.uid() = setter_id);

CREATE POLICY "Setters can create meetings"
  ON public.meetings FOR INSERT
  WITH CHECK (auth.uid() = setter_id AND public.has_role(auth.uid(), 'setter'));

CREATE POLICY "Clients can view approved meetings"
  ON public.meetings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'client') AND
    approved_by_admin = TRUE AND
    client_id IN (
      SELECT id FROM public.clients
      WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Clients can update meeting status"
  ON public.meetings FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'client') AND
    approved_by_admin = TRUE AND
    client_id IN (
      SELECT id FROM public.clients
      WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'client') AND
    approved_by_admin = TRUE
  );

-- RLS Policies for performance
CREATE POLICY "Admins can view all performance"
  ON public.performance FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters can view their own performance"
  ON public.performance FOR SELECT
  USING (auth.uid() = setter_id);

CREATE POLICY "Admins can manage performance"
  ON public.performance FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters can update their own performance"
  ON public.performance FOR UPDATE
  USING (auth.uid() = setter_id);

-- RLS Policies for leads
CREATE POLICY "Admins can manage all leads"
  ON public.leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Setters can manage their own leads"
  ON public.leads FOR ALL
  USING (auth.uid() = setter_id);

-- RLS Policies for resources
CREATE POLICY "Everyone can view resources"
  ON public.resources FOR SELECT
  USING (
    CASE
      WHEN public.has_role(auth.uid(), 'admin') THEN TRUE
      WHEN public.has_role(auth.uid(), 'setter') THEN TRUE
      WHEN public.has_role(auth.uid(), 'client') THEN visible_to_clients = TRUE
      ELSE FALSE
    END
  );

CREATE POLICY "Admins can manage resources"
  ON public.resources FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_updated_at
  BEFORE UPDATE ON public.performance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();