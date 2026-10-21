-- Fix the generate_invoice_number function to avoid ambiguous column reference
-- The local variable 'invoice_number' conflicts with the column name in the table

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
  result_invoice_number text;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN ar.invoice_number ~ '^MSP-INV-[0-9]+$' 
      THEN CAST(SUBSTRING(ar.invoice_number FROM 8) AS integer)
      ELSE 0 
    END
  ), 0) + 1 
  INTO next_num 
  FROM public.accounting_records ar;
  
  result_invoice_number := 'MSP-INV-' || LPAD(next_num::text, 4, '0');
  RETURN result_invoice_number;
END;
$function$;