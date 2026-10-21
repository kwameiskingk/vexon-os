
-- Create pre_disco_research table
CREATE TABLE public.pre_disco_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id TEXT,
  company_name TEXT NOT NULL,
  company_website TEXT NOT NULL,
  research_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pre_disco_research ENABLE ROW LEVEL SECURITY;

-- Policies for admin, dev, ops, account_executive
CREATE POLICY "Authorized roles can view research"
  ON public.pre_disco_research FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev', 'ops', 'account_executive')
  ));

CREATE POLICY "Authorized roles can insert research"
  ON public.pre_disco_research FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev', 'ops', 'account_executive')
  ));

CREATE POLICY "Authorized roles can update research"
  ON public.pre_disco_research FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev', 'ops', 'account_executive')
  ));

-- Trigger for updated_at
CREATE TRIGGER update_pre_disco_research_updated_at
  BEFORE UPDATE ON public.pre_disco_research
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
