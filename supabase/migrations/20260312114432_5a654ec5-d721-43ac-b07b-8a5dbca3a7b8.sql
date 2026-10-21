
-- Create employee leave requests table
CREATE TABLE public.employee_leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sick', 'holiday', 'family_personal')),
  leave_days_amount INTEGER NOT NULL CHECK (leave_days_amount > 0),
  leave_start_date DATE NOT NULL,
  return_date DATE NOT NULL,
  doctor_note_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_leave_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Users can view own leave requests"
ON public.employee_leave_requests FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()));

-- Employees can insert their own requests
CREATE POLICY "Users can create own leave requests"
ON public.employee_leave_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Admin/HR can update leave requests (approve/reject)
CREATE POLICY "Admin can update leave requests"
ON public.employee_leave_requests FOR UPDATE
TO authenticated
USING (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()));

-- Create storage bucket for doctor notes
INSERT INTO storage.buckets (id, name, public) VALUES ('doctor-notes', 'doctor-notes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for doctor notes
CREATE POLICY "Users can upload doctor notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'doctor-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own doctor notes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'doctor-notes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid())));

-- Add updated_at trigger
CREATE TRIGGER update_employee_leave_requests_updated_at
  BEFORE UPDATE ON public.employee_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
