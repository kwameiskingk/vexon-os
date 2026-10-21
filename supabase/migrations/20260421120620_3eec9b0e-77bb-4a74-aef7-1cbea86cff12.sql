CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.complete_linked_task(
    NEW.user_id,
    'form_hourly_' || NEW.hour_slot::text,
    NEW.hour_slot,
    COALESCE(NEW.date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$function$;