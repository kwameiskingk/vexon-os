
-- Create enrichment_requests table
CREATE TABLE public.enrichment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL,
  linkedin_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'enriching', 'enriched', 'not_found', 'error')),
  mobile_phone TEXT,
  direct_phone TEXT,
  work_phone TEXT,
  phone_best TEXT,
  email TEXT,
  source TEXT,
  raw_payload JSONB,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.enrichment_requests ENABLE ROW LEVEL SECURITY;

-- Setters: own rows only
CREATE POLICY "Users can view own enrichment requests"
  ON public.enrichment_requests FOR SELECT
  USING (auth.uid() = created_by_user_id);

CREATE POLICY "Users can insert own enrichment requests"
  ON public.enrichment_requests FOR INSERT
  WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Users can update own enrichment requests"
  ON public.enrichment_requests FOR UPDATE
  USING (auth.uid() = created_by_user_id);

-- Admins: all rows
CREATE POLICY "Admins can view all enrichment requests"
  ON public.enrichment_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all enrichment requests"
  ON public.enrichment_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Service role policy for webhook callback (no auth context)
CREATE POLICY "Service role can update enrichment requests"
  ON public.enrichment_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_enrichment_requests_updated_at
  BEFORE UPDATE ON public.enrichment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create warm_leads table
CREATE TABLE public.warm_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL,
  linkedin_url TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  enrichment_request_id UUID REFERENCES public.enrichment_requests(id)
);

-- Enable RLS
ALTER TABLE public.warm_leads ENABLE ROW LEVEL SECURITY;

-- Setters: own rows only
CREATE POLICY "Users can view own warm leads"
  ON public.warm_leads FOR SELECT
  USING (auth.uid() = created_by_user_id);

CREATE POLICY "Users can insert own warm leads"
  ON public.warm_leads FOR INSERT
  WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Users can delete own warm leads"
  ON public.warm_leads FOR DELETE
  USING (auth.uid() = created_by_user_id);

-- Admins: all rows
CREATE POLICY "Admins can view all warm leads"
  ON public.warm_leads FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all warm leads"
  ON public.warm_leads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
