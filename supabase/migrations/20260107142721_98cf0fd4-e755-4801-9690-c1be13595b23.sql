-- Set REPLICA IDENTITY FULL on accounting_records for better realtime support
ALTER TABLE public.accounting_records REPLICA IDENTITY FULL;