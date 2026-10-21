-- Create employee attendance tracking table
CREATE TABLE public.employee_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'late')),
  marked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Create index for faster queries
CREATE INDEX idx_employee_attendance_employee_date ON public.employee_attendance(employee_id, date);
CREATE INDEX idx_employee_attendance_date ON public.employee_attendance(date);

-- Enable RLS
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

-- Only admin, ops, dev can view attendance
CREATE POLICY "Admin roles can view attendance"
ON public.employee_attendance
FOR SELECT
USING (public.is_admin_role(auth.uid()));

-- Only admin, ops, dev can insert attendance
CREATE POLICY "Admin roles can insert attendance"
ON public.employee_attendance
FOR INSERT
WITH CHECK (public.is_admin_role(auth.uid()));

-- Only admin, ops, dev can update attendance
CREATE POLICY "Admin roles can update attendance"
ON public.employee_attendance
FOR UPDATE
USING (public.is_admin_role(auth.uid()));

-- Only admin, ops, dev can delete attendance
CREATE POLICY "Admin roles can delete attendance"
ON public.employee_attendance
FOR DELETE
USING (public.is_admin_role(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_employee_attendance_updated_at
BEFORE UPDATE ON public.employee_attendance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();