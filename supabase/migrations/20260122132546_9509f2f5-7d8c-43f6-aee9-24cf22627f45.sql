-- Phase 2: Create new tables for Accounting department

-- Invoices table for PDF storage and tracking
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  file_path TEXT,
  description TEXT,
  due_date DATE,
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Operating costs for recurring expenses
CREATE TABLE public.operating_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('software', 'contractor', 'ads', 'tools', 'office', 'other')),
  amount NUMERIC(10,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly', 'one-time')),
  vendor TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Accounting templates storage
CREATE TABLE public.accounting_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('invoice', 'payment_terms', 'reminder', 'bank_details', 'other')),
  file_path TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phase 3: Create new tables for HR department

-- Employee payslips tracking
CREATE TABLE public.employee_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  amount NUMERIC(10,2),
  file_path TEXT,
  sent_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

-- Employee documents storage
CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('contract', 'id', 'right_to_work', 'bank_details', 'other')),
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  expiry_date DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Employee onboarding pipeline
CREATE TABLE public.employee_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  stage TEXT NOT NULL DEFAULT 'offer_accepted' CHECK (stage IN ('offer_accepted', 'contract_sent', 'docs_received', 'accounts_provisioned', 'training_scheduled', 'active', 'cancelled')),
  stage_completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phase 4: Enable RLS on all new tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_onboarding ENABLE ROW LEVEL SECURITY;

-- Phase 5: Create helper function for accounting role check
CREATE OR REPLACE FUNCTION public.is_accounting_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dev', 'ops', 'finance', 'accounting')
  )
$$;

-- Create helper function for HR role check
CREATE OR REPLACE FUNCTION public.is_hr_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dev', 'ops', 'hr')
  )
$$;

-- Phase 6: RLS Policies for Accounting tables

-- Invoices policies
CREATE POLICY "Accounting roles can view invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can insert invoices"
ON public.invoices FOR INSERT
TO authenticated
WITH CHECK (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can delete invoices"
ON public.invoices FOR DELETE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

-- Operating costs policies
CREATE POLICY "Accounting roles can view operating costs"
ON public.operating_costs FOR SELECT
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can insert operating costs"
ON public.operating_costs FOR INSERT
TO authenticated
WITH CHECK (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can update operating costs"
ON public.operating_costs FOR UPDATE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can delete operating costs"
ON public.operating_costs FOR DELETE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

-- Accounting templates policies
CREATE POLICY "Accounting roles can view templates"
ON public.accounting_templates FOR SELECT
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can insert templates"
ON public.accounting_templates FOR INSERT
TO authenticated
WITH CHECK (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can update templates"
ON public.accounting_templates FOR UPDATE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting roles can delete templates"
ON public.accounting_templates FOR DELETE
TO authenticated
USING (public.is_accounting_role(auth.uid()));

-- Phase 7: RLS Policies for HR tables

-- Employee payslips policies
CREATE POLICY "HR roles can view payslips"
ON public.employee_payslips FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can insert payslips"
ON public.employee_payslips FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can update payslips"
ON public.employee_payslips FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can delete payslips"
ON public.employee_payslips FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- Employee documents policies
CREATE POLICY "HR roles can view documents"
ON public.employee_documents FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can insert documents"
ON public.employee_documents FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can update documents"
ON public.employee_documents FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can delete documents"
ON public.employee_documents FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- Employee onboarding policies
CREATE POLICY "HR roles can view onboarding"
ON public.employee_onboarding FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can insert onboarding"
ON public.employee_onboarding FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can update onboarding"
ON public.employee_onboarding FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can delete onboarding"
ON public.employee_onboarding FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- Phase 8: Create triggers for updated_at
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_operating_costs_updated_at
BEFORE UPDATE ON public.operating_costs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounting_templates_updated_at
BEFORE UPDATE ON public.accounting_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_payslips_updated_at
BEFORE UPDATE ON public.employee_payslips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_documents_updated_at
BEFORE UPDATE ON public.employee_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_onboarding_updated_at
BEFORE UPDATE ON public.employee_onboarding
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 9: Create storage buckets for new document types
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('payslips', 'payslips', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('accounting-templates', 'accounting-templates', false) ON CONFLICT DO NOTHING;

-- Storage policies for employee-documents bucket
CREATE POLICY "HR can upload employee documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-documents' AND public.is_hr_role(auth.uid()));

CREATE POLICY "HR can view employee documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-documents' AND public.is_hr_role(auth.uid()));

CREATE POLICY "HR can delete employee documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'employee-documents' AND public.is_hr_role(auth.uid()));

-- Storage policies for payslips bucket
CREATE POLICY "HR can upload payslips"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payslips' AND public.is_hr_role(auth.uid()));

CREATE POLICY "HR can view payslips"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payslips' AND public.is_hr_role(auth.uid()));

CREATE POLICY "HR can delete payslips"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payslips' AND public.is_hr_role(auth.uid()));

-- Storage policies for accounting-templates bucket
CREATE POLICY "Accounting can upload templates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'accounting-templates' AND public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting can view templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'accounting-templates' AND public.is_accounting_role(auth.uid()));

CREATE POLICY "Accounting can delete templates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'accounting-templates' AND public.is_accounting_role(auth.uid()));