INSERT INTO public.user_capabilities (user_id, capability, granted_by)
VALUES ('916e451a-9e25-4e27-89ab-a5f3374d81ac', 'can_view_ceo_dashboard', '916e451a-9e25-4e27-89ab-a5f3374d81ac')
ON CONFLICT DO NOTHING;