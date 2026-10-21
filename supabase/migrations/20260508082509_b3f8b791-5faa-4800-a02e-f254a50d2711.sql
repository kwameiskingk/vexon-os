UPDATE public.setters_profiles sp
SET status = 'active', status_changed_at = now()
WHERE sp.status = 'pip'
  AND NOT EXISTS (
    SELECT 1 FROM public.pip_records pr
    WHERE pr.setter_profile_id = sp.id
      AND pr.status = 'active'
  );