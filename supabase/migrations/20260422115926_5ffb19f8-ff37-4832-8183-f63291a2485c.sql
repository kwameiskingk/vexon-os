CREATE OR REPLACE FUNCTION public.tg_complete_eod_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.complete_linked_task(
    NEW.setter_id,
    'form_eod',
    NULL,
    COALESCE(NEW.date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$$;