-- 12 Oct 2026 (acquisition PR A2): Tom Reilly's setter profile has
-- department = 'operations'. Every department fork in the setter portal treats
-- anything that is not 'acquisition' as fulfilment, so he has been getting the
-- fulfilment Log dialog and, since the strip, the fulfilment Appointments
-- header, and his acquisition-only tiles never rendered. He is an acquisition
-- setter who also runs the Marketing Hub; that access is keyed on his user id,
-- not on the department. the owner, 12 Oct: set him to acquisition.
-- Safe to run twice.

UPDATE public.setters_profiles
SET department = 'acquisition'
WHERE user_id = '42292222-46a0-4b2c-85b8-ecf3fca6415b'
  AND department IS DISTINCT FROM 'acquisition';
